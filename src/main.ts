import { Map } from 'immutable'

type Context = {
    req: Request;
    res: Response;
}
type Middleware = (ctx: Context) => Promise<Context> | Context;
interface Decoder {

}
interface MessageResponse<T = string> {
    message: T;
    status: number;
}
type Message = <T>(message: T) => MessageResponse<T>;

interface ServiceData {

}

interface Service {

    /**
     * Assign a part of the path to one of the service endpoints
     * This urlPart will be erased when handler assigned
     * In order to create a permanent urlPath, which will be used with number of handlers, use `route` method
     * @param urlPart
     */
    path(urlPart: string): Service;

    /**
     * Assign a permanent part of the path to the service
     * @param urlPart
     */
    route(urlPart: string): Service;

    get(): Service;
    post(): Service;
    put(): Service;
    delete(): Service;
    patch(): Service;
    head(): Service;
    options(): Service;

    use(middleware: Middleware): Service;

    param(paramName: string, decoder?: Decoder): Service;

    query(queryParam: string, decoder?: Decoder): Service;
    query(decoder: Decoder): Service;

    handler<T>(fn: (req: Request, res: Response) => MessageResponse<T>): Service;
}

enum Method {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE',
    PATCH = 'PATCH',
    HEAD = 'HEAD',
    OPTIONS = 'OPTIONS',
}
type NodeContext = {
    method?: Method;
}

enum ParamType {
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    BOOLEAN = 'BOOLEAN',
}
enum IndexType {
    PATH = 'PATH',
    PARAM = 'PARAM',
}
class NodeIndex<I extends string, T extends IndexType, P extends ParamType> {
    constructor(id: I, type: IndexType.PATH)
    constructor(id: I, type: IndexType.PARAM, paramType: ParamType)
    constructor(
        public id: I,
        public type: T,
        public paramType?: P,
    ) {}
}
class Node {
    constructor(
        // url part
        public readonly index: NodeIndex,
        private context: NodeContext | null = null,
        private children: Map<string, Node> | null = null,
        private middleware: Middleware[] = [],
    ) {}

    addMiddleware(middleware: Middleware) {
        this.middleware.push(middleware);
    }

    addChild<T extends IndexType>(urlPart: NodeIndex<T>) {
        if (this.children === null) {
            this.children = Map<string, Node>();
        }
        const node = new Node(urlPart, this.context);
        this.children = this.children.set(urlPart.id, node);
        return node
    }

    updateContext<K extends keyof NodeContext>(key: K, value: NodeContext[K]) {
        if (this.context === null) {
            const k: keyof NodeContext = key; // TS is so stupid
            this.context = { [k]: value };
        }
        else {
            this.context[key] = value;
        }
    }

    next(urlPart: string): Node | null {
        return this.children && (
            this.children.get(urlPart) || null
        );
    }
}


class Service implements Service {
    private readonly root: Node;
    private cursor: Node;

    /**
     * Initialization of the service. Work as the "route" method
     * @param basePath - base path for the service, work just like a "route" method
     */
    constructor(basePath: string = '/') {
        if (basePath.charAt(0) !== '/' || basePath.charAt(basePath.length - 1) !== '/') {
            throw new Error('Base path should start and end with "/"');
        }
        this.root = new Node(new NodeIndex(basePath, IndexType.PATH));
        this.cursor = this.root;
    }
    path(urlPart: string): Service {
        this.cursor = this.cursor.addChild(new NodeIndex(urlPart, IndexType.PATH));
        return this;
    }
    param<ID extends string, T extends ParamType>(paramId: ID, type: T) {
        this.cursor = this.cursor.addChild(
            new NodeIndex(paramId, IndexType.PARAM, type)
        )
        return this;
    }


    private setMethod(method: Method): Service {
        this.cursor.updateContext('method', method);
        return this;
    }
    get(): Service {
        return this.setMethod(Method.GET);
    }
    post(): Service {
        return this.setMethod(Method.POST);
    }
    put(): Service {
        return this.setMethod(Method.PUT);
    }
    delete(): Service {
        return this.setMethod(Method.DELETE);
    }
    patch(): Service {
        return this.setMethod(Method.PATCH);
    }
    head(): Service {
        return this.setMethod(Method.HEAD);
    }
    options(): Service {
        return this.setMethod(Method.OPTIONS);
    }

    use(middleware: Middleware): Service {
        this.cursor.addMiddleware(middleware);
        return this;
    }
    handler(fn: (ctx: Context) => MessageResponse): Service {
        const middleware = async (ctx: Context) => {
            const res = await fn(ctx);
            ctx.res.setMessage(res.message);
            return ctx;
        }
        this.cursor.addMiddleware(middleware);
        return this;
    }
}