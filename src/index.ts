import { createServer } from '@modelcontextprotocol/sdk/server'
import { httpHandler } from '@modelcontextprotocol/sdk/http'
import { createTool, ToolCallRequest } from '@modelcontextprotocol/sdk/tool'

export default {
  async fetch(request: Request): Promise<Response> {
    console.log('Incoming request:', request.method, request.url)

    const server = createServer({
      tools: [
        createTool({
          name: 'create_featurebase_post',
          description: 'Create a post in Featurebase using their API',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              content: { type: 'string' },
              category: { type: 'string' },
              apiKey: { type: 'string' }
            },
            required: ['title', 'content', 'category', 'apiKey']
          },
          async execute({ input, respondWithStream }: ToolCallRequest) {
            console.log('Tool called with:', input)

            const { title, content, category, apiKey } = input

            const stream = respondWithStream()

            try {
              const response = await fetch('https://api.featurebase.app/v1/posts', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({ title, content, category })
              })

              const result = await response.json()
              console.log('Featurebase response:', result)

              await stream.write({
                type: 'text',
                text: `✅ Post created with ID: ${result.id}\n`
              })
              await stream.close()
            } catch (err) {
              console.error('Error creating post:', err)
              await stream.write({
                type: 'text',
                text: `❌ Error: ${err.message || 'Unknown error'}\n`
              })
              await stream.close()
            }
          }
        })
      ]
    })

    return httpHandler(server)(request)
  }
}
