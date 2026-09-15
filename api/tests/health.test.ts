import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { buildApp } from '../src/app.js'

describe('GET /health', () => {
  it('responde ok y llega a la base', async () => {
    const res = await request(buildApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, db: true })
  })
})
