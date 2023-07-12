# n_h

## Concept

A library for creating HTTP services. It’s inspired by Express.js, Spring Boot, and mostly http4s. Aims to be convenient, type-safe, performant, and testable. Takes a lot of concepts from functional programming, but does not force you to deep into complicated concepts.

## Code samples

These are very early concepts of how code might be looks like

Version: 0.1
```ts
const jsonDecoder = (r: Request) => 
	r.flatMap(r => r.body.as(Decoder.JSON).then(body => r.set('body', body)))

const rootService = Service('/')
	.get().path('bad').handler(() => BadRequest('Bad'))
	.get().path('ok').handler(() => Ok('OK'))
	.post().path('post').handler(() => Ok())
	.post().path('echo').handler(r => r.body.as('string').then(Ok))
	.get().path('b/c').handler(() => Ok())
	.post().path('query').query('name', QueryDecoder.string).handler(r => Ok(`Hello ${r.query.name}!`))
	.get().path('wait').handler(() => sleep(10).then(Ok))
	.get().path('boom').handler(Promise.reject)
	.post().path('reverse').handler(r => r.body.as(Decoders.String).then(str => str.reverse()).then(Ok))
	.post.path('body').use(jsonDecoder).handler(r => Ok(r.body))
```

Version: 0.2. A full scale appication for managing a restaurant:
```ts
import { Service } from 'n_h'
import * as Decoders from 'n_h/decoders'
import { Ok, Unauthorized } from 'n_h/response'
import { Schema, t } from 'n_h/schema'
import * as Middleware from 'n_h/middleware'

import { connect } from 'src:/database'

const corsPolicy = Middleware.CORS()
	.withAllowOrigin(process.env.CLIENT_DOMAIN)
	.withAllowMethodsAll()
	.withAllowCredentials(true)
	.withAllowHeaders(new Set('Content-Type'))
const session = Middleware.Session()

const rootService = Service('/').use(corsPolicy, sessionMiddleware)

const loginBodyDecoder = Decoders.JSON.fromSchema(
	Schema(t.struct({
		email: t.string,
		password: t.string,
	}))
).toMiddleware()

const connectDatabaseMiddleware = Middleware.mapRequest(
	req => connect().then(db => req.set('db', db))
)

const authService = rootService
	.post().path('registration').use(loginBodyDecoder).handler(
		(req) => {
			const user = await addUser(db, req.body)
			await updateSession(db, req.session.id)
			return Ok()
		}
	)
	.post().path('/login').use(loginBodyDecoder).handler(
		(req) => {
			const { body } = req
			const user = await getUser(req.db, body.email, body.password)
			if (user) {
				await updateSession(req.db, req.session.id)
				return Ok(user)
			} else {
				return Unauthorized('no such user')
			}
		}
	)

const productBodyDecoder = Decoders.FormData.fromScheme(
	Schema(t.struct({
		title: t.string,
		description: t.string,
		price: t.string,
		image: t.binaryStream,
	}))
)
const productService = rootService
	.route('products')
	.get().handler(
		() => ProductModel.getAllProducts().then(Ok).catch(NotFound)
	)
	.get().param('id', Decoders.number).handler(
		(req) => ProductModel.getProduct(req.id).then(Ok).catch(NotFound)
	)
	.post().use(productBodyDecoder).handler(
		(req) => {
			const { image, title, description, price } = req.body
			const path = ImageDomain.createImage(image)
			return Ok(ProductDomain.createProduct({ title, description, price, image: path }))
		}
	)


const app = Service.combine(authService, productService)

Server()
	.withPort(8081)
	.withService(app)
	.start()
```

## Implementation details

The main important thing is a **Service**. The service is a pure data structure. It is not strictly bound with the real HTTP request but rather just takes some request-like input, and produces a response-like answer. The library user is not concerned about it and just uses a declarative interface. Services might be merged together, and then a dedicated structure, a **Server**, takes service and opens real HTTP connections.

When I'm talking about service as a data structure, I mean a tree, something similar to prefix-tree, where every node has some context, some index (url part), and some middleware that must be executed to go forward.
