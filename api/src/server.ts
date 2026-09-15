import { buildApp } from './app.js'

const port = Number(process.env.PORT ?? 8080)
buildApp().listen(port, () => console.log(`API escuchando en :${port}`))
