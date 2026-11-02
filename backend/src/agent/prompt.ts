import {
  ARCHITECTURE_TEMPLATES,
  type ArchitectureGraph,
  type AssistLocale,
  CONTAINER_KINDS,
  CONTAINMENT_RULES,
  type LintFinding,
  NODE_CATALOG,
  NODE_KINDS,
  type TemplateId,
} from '@archdraft/shared';

/**
 * The words sent to the model. The prompt is in English, which small models
 * follow best; the names and explanations it writes are in the language of
 * the person. Everything about the catalog is generated from `shared`, so the
 * prompt can never offer a kind the validator would reject.
 */

const LANGUAGE: Record<AssistLocale, string> = { en: 'English', es: 'Spanish' };

/** The kinds of node, one per line, grouped as the catalog groups them. */
export function catalogSummary(): string {
  return NODE_KINDS.map((kind) => {
    const { category, description } = NODE_CATALOG[kind];
    return `- ${kind} (${category}): ${description}`;
  }).join('\n');
}

/** Where each kind of container may go. */
export function containmentSummary(): string {
  return CONTAINER_KINDS.map((kind) => {
    const { topLevel, parents } = CONTAINMENT_RULES[kind];
    const where = [
      topLevel ? 'top level' : undefined,
      ...parents.map((parent) => `inside ${parent}`),
    ]
      .filter((place) => place !== undefined)
      .join(', ');
    return `- ${kind}: ${where}`;
  }).join('\n');
}

const MODELLING_RULES = `Modelling rules:
- Ids are short slugs that say what the node is ("orders-db", "api"), unique among nodes and among edges.
- Every node has a "kind" from the catalog below and a short "label". Only shapes (box, circle, diamond, note, text) may have an empty label.
- Containers (region, availability-zone, network, subnet, boundary) group other nodes through "parentId". They are never the source or target of an edge: connect the components inside them.
- Components may sit at the top level or inside any container. Containers may only nest as listed below.
- Edges go from the node that starts the interaction to the one that receives it. "mode" is "sync" when the caller waits for an answer, "async" otherwise. Give a "protocol" when it is clear.
- Set "attributes" (replicas, multiAz, autoscaling, publiclyAccessible, encryptedAtRest, managed) only when they are known or decided by the design; leave out what is unknown.
- Use "service" for the concrete product only when it differs from the usual one for the provider (for example "Aurora" for a relational-db on AWS).
- Do not add shapes, notes or text unless they are asked for.
- Model what was asked, without inventing parts the description does not need.
- List the nodes in the order the requests flow: people and clients first, then the entry (CDN, gateway, load balancer), then compute, then queues, data stores and external services. A container comes right before what it holds. List the edges in the same order. The editor lays the diagram out in this order, so it decides how tidy it looks.`;

/** How to turn what a person writes into what they need. */
const READING_RULES = `How to read a request:
- Read it as a senior architect would: work out what the system has to do and for whom, then design the smallest architecture that does it well.
- When the request leaves out a part the system cannot work without (how people reach it, where its data is kept), add the usual one.
- When the request is ambiguous, take the most usual reading.
- Secure by default: data stores stay private and are reached through a service, never straight from clients; clients reach compute through a load balancer, API gateway or CDN; sensitive data is encrypted at rest. When the request asks for something unsafe, design the safe version instead; keep the unsafe one only when the person insists on it explicitly.
- "assumptions" lists, in at most six short sentences, what you decided that the request did not say: parts you added, the reading you took, what you made safer than asked. Leave it empty when there is nothing of the sort.`;

export function systemPrompt(locale: AssistLocale): string {
  return [
    'You are the architecture assistant of Archdraft, an editor of cloud architecture diagrams.',
    'You answer with a single JSON object and nothing else: no prose, no code fences.',
    `Write every label, title, summary and explanation in ${LANGUAGE[locale]}. Ids stay in English.`,
    MODELLING_RULES,
    READING_RULES,
    `Kinds of node (kind (category): meaning):\n${catalogSummary()}`,
    `Where containers may go:\n${containmentSummary()}`,
  ].join('\n\n');
}

const compact = (value: unknown) => JSON.stringify(value);

/**
 * Words that point to each template, in English and Spanish. The example
 * closest to the request shows the model the shape of what it is asked for.
 */
const EXAMPLE_HINTS: Record<TemplateId, RegExp> = {
  'serverless-api':
    /\b(serverless|lambda|functions?|funci[oó]n(es)?|api( rest)?|backend|endpoints?)\b/gi,
  'three-tier-web':
    /\b(three[- ]tier|tres capas|3 capas|monolith|monol[ií]tic[oa]|web app|aplicaci[oó]n web|e-?commerce|tienda|shop|store|vms?|ec2|servidor(es)?|servers?)\b/gi,
  'event-driven-microservices':
    /\b(microservic\w*|events?|eventos?|queues?|colas?|kafka|pub\/?sub|messaging|mensajer[ií]a|sagas?|orders?|pedidos?)\b/gi,
  'analytics-pipeline':
    /\b(analytics|anal[ií]tica|pipelines?|etl|elt|warehouse|almac[eé]n de datos|lakes?|lago de datos|dashboards?|bi|streaming|ingest\w*|ingesta|reports?|informes?)\b/gi,
  'rag-chatbot':
    /\b(rag|chat ?bots?|llms?|embeddings?|vector\w*|ai|ia|gpt|assistants?|asistentes?|agents?|agentes?|semantic search|b[uú]squeda sem[aá]ntica)\b/gi,
  'static-site-cms':
    /\b(static|est[aá]tic[oa]|blog|cms|landing|portfolio|wordpress|headless|documentation site|sitio web|website|marketing)\b/gi,
};

/** A diagram written well, close to what is asked, so the model sees the format used as intended. */
export function exampleGraph(prompt = ''): ArchitectureGraph {
  let best: TemplateId = 'serverless-api';
  let bestScore = 0;
  for (const [id, hint] of Object.entries(EXAMPLE_HINTS) as [TemplateId, RegExp][]) {
    const score = prompt.match(hint)?.length ?? 0;
    if (score > bestScore) [best, bestScore] = [id, score];
  }
  return ARCHITECTURE_TEMPLATES[best];
}

const GRAPH_ANSWER = `Answer with {"title": string, "rationale": string, "assumptions": [string], "graph": <the whole diagram>}. "title" names the diagram or the proposal in a few words; "rationale" explains the design in two or three sentences. The diagram follows this JSON Schema:`;

const PATCH_ANSWER = `A change is a list of operations, applied in order:
- {"op":"addNode","node":{...}} and {"op":"addEdge","edge":{...}} with the whole new node or edge.
- {"op":"updateNode","id":"...","changes":{...}} and {"op":"updateEdge","id":"...","changes":{...}} with only the fields that change; null removes a field. In a node, "attributes" lists only the attributes that change.
- {"op":"removeNode","id":"..."} also removes its edges; what it contains moves to its container. {"op":"removeEdge","id":"..."}.
- {"op":"updateDiagram","changes":{"title"?,"description"?,"provider"?}}.
Use the ids of the current diagram to refer to what is there, and new ids for what you add.`;

export function generateMessage(
  prompt: string,
  provider: string | undefined,
  graphSchema: object,
): string {
  return [
    `Design the architecture diagram for this description:\n"""${prompt}"""`,
    provider === undefined
      ? 'Use the cloud provider the description names ("aws", "gcp" or "azure"), or "generic" if it names none.'
      : `Use "${provider}" as the provider of the diagram.`,
    `${GRAPH_ANSWER}\n${compact(graphSchema)}`,
    `An example of a good diagram, for its format and its order, not its content:\n${compact(exampleGraph(prompt))}`,
  ].join('\n\n');
}

function currentDiagram(graph: ArchitectureGraph): string {
  return `The current diagram:\n${compact(graph)}`;
}

export function editMessage(
  prompt: string,
  graph: ArchitectureGraph,
  answerSchema: object,
): string {
  return [
    currentDiagram(graph),
    `Change it as asked, and only as asked:\n"""${prompt}"""`,
    'Read the request as the rules above say: what it needs to work, and safe. Connect what you add to the parts it serves, and put it in the container it belongs to.',
    PATCH_ANSWER,
    `Answer with {"title": string, "rationale": string, "assumptions": [string], "operations": [...]}: "title" says in a few words what changed and "rationale" why. JSON Schema of the answer:\n${compact(answerSchema)}`,
  ].join('\n\n');
}

export function describeFinding(finding: LintFinding): string {
  const where = finding.nodeIds.length > 0 ? ` (nodes: ${finding.nodeIds.join(', ')})` : '';
  return `- [${finding.severity}] ${finding.ruleId}: ${finding.message}${where}. Suggestion: ${finding.suggestion}`;
}

export function improveMessage(
  graph: ArchitectureGraph,
  findings: readonly LintFinding[],
  focus: string | undefined,
  answerSchema: object,
): string {
  return [
    currentDiagram(graph),
    findings.length > 0
      ? `The design rules of the editor found:\n${findings.map(describeFinding).join('\n')}`
      : 'The design rules of the editor found nothing; look for what they do not check.',
    focus === undefined ? undefined : `Focus on this:\n"""${focus}"""`,
    'Propose between one and five independent improvements, most valuable first: fixes for the findings that matter, and anything else a senior architect would raise about availability, security, scalability, cost or simplicity. Each improvement must make sense applied on its own to the current diagram.',
    PATCH_ANSWER,
    `Answer with {"proposals": [{"title": string, "rationale": string, "ruleIds": [the ids of the findings it solves], "operations": [...]}]}. JSON Schema of the answer:\n${compact(answerSchema)}`,
  ]
    .filter((part) => part !== undefined)
    .join('\n\n');
}

const REDESIGN_GOALS = {
  simplify:
    'Propose a simpler architecture that does the same job: fewer parts, managed services instead of self-run ones, no layers that the scale and needs of the diagram do not justify. Keep what is essential to what the system does.',
  extend:
    'Propose a more complete architecture, ready for production: high availability where it matters, protection at the entry (WAF, gateway, CDN), identity, secrets, monitoring, queues for slow or bursty work, and encryption of data. Keep what is there unless it is replaced by something better.',
} as const;

export function redesignMessage(
  goal: keyof typeof REDESIGN_GOALS,
  graph: ArchitectureGraph,
  focus: string | undefined,
  graphSchema: object,
): string {
  return [
    currentDiagram(graph),
    REDESIGN_GOALS[goal],
    focus === undefined ? undefined : `Take this into account:\n"""${focus}"""`,
    'Reuse the ids of the nodes and edges you keep, so the person can see what changed.',
    `${GRAPH_ANSWER}\n${compact(graphSchema)}`,
  ]
    .filter((part) => part !== undefined)
    .join('\n\n');
}
