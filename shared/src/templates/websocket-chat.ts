import type { ArchitectureGraph } from '../schema.ts';

/**
 * After "Announcing WebSocket APIs in Amazon API Gateway" and its sample application
 * simple-websockets-chat-app:
 * https://aws.amazon.com/blogs/compute/announcing-websocket-apis-in-amazon-api-gateway/
 * https://github.com/aws-samples/simple-websockets-chat-app
 */
export const websocketChat = {
  schemaVersion: 1,
  title: 'Real-time chat with WebSockets',
  description:
    'Chat where messages reach everyone in a room at once. Clients keep a WebSocket open with an API gateway, which runs a function when someone connects, sends a message or leaves. The functions keep the open connections in a table and post each message back through the gateway to every connection.',
  provider: 'aws',
  nodes: [
    { id: 'browser', kind: 'web-client', label: 'Chat in the browser' },
    { id: 'phone', kind: 'mobile-client', label: 'Chat app' },
    { id: 'region', kind: 'region', label: 'us-west-2' },
    { id: 'identity', kind: 'identity-provider', label: 'User sign-in', parentId: 'region' },
    {
      id: 'gateway',
      kind: 'api-gateway',
      label: 'WebSocket API',
      service: 'Amazon API Gateway',
      parentId: 'region',
    },
    { id: 'on-connect', kind: 'function', label: 'On connect', parentId: 'region' },
    { id: 'send-message', kind: 'function', label: 'Send message', parentId: 'region' },
    { id: 'on-disconnect', kind: 'function', label: 'On disconnect', parentId: 'region' },
    {
      id: 'connections',
      kind: 'nosql-db',
      label: 'Open connections',
      parentId: 'region',
      attributes: { encryptedAtRest: true, managed: true },
    },
    { id: 'logs', kind: 'logging', label: 'Logs', parentId: 'region' },
  ],
  edges: [
    {
      id: 'browser-identity',
      source: 'browser',
      target: 'identity',
      label: 'Sign in',
      protocol: 'https',
    },
    { id: 'browser-gateway', source: 'browser', target: 'gateway', protocol: 'websocket' },
    { id: 'phone-gateway', source: 'phone', target: 'gateway', protocol: 'websocket' },
    {
      id: 'gateway-identity',
      source: 'gateway',
      target: 'identity',
      label: 'Validate token',
      protocol: 'https',
    },
    { id: 'gateway-connect', source: 'gateway', target: 'on-connect', label: '$connect' },
    { id: 'gateway-send', source: 'gateway', target: 'send-message', label: 'sendmessage' },
    { id: 'gateway-disconnect', source: 'gateway', target: 'on-disconnect', label: '$disconnect' },
    {
      id: 'connect-table',
      source: 'on-connect',
      target: 'connections',
      label: 'Save id',
      protocol: 'https',
    },
    {
      id: 'send-table',
      source: 'send-message',
      target: 'connections',
      label: 'List room',
      protocol: 'https',
    },
    {
      id: 'disconnect-table',
      source: 'on-disconnect',
      target: 'connections',
      label: 'Remove id',
      protocol: 'https',
    },
    {
      id: 'send-post',
      source: 'send-message',
      target: 'gateway',
      label: 'Post to each connection',
      protocol: 'https',
      mode: 'async',
    },
  ],
} satisfies ArchitectureGraph;
