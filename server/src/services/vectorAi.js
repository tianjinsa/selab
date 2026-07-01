import sql from 'mssql';
import { createHash } from 'node:crypto';
import { config } from '../config.js';
import { badRequest } from '../utils/errors.js';
import { extractTaskKeywords } from '../utils/content.js';

const VECTOR_DIMENSIONS = 1024;
const DUPLICATE_DISTANCE = 0.08;
const SIMILAR_DISTANCE = 0.20;
const LABEL_MAX = 200;
const ENTITY_TYPE_MAX = 60;
const ENTITY_ID_MAX = 200;

let pool = null;
let connecting = null;
let schemaReady = null;
let nativeVectorAvailable = true;

function now() {
  return new Date().toISOString();
}

function sqlConfig() {
  return {
    server: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    options: {
      encrypt: false,
      trustServerCertificate: config.db.trustServerCertificate
    },
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

async function getPool() {
  if (pool?.connected) return pool;
  if (!connecting) {
    connecting = (async () => {
      const next = new sql.ConnectionPool(sqlConfig());
      next.on('error', (error) => {
        console.error('SQL Server vector pool error:', error.message);
      });
      pool = await next.connect();
      schemaReady = null;
      return pool;
    })().finally(() => {
      connecting = null;
    });
  }
  return connecting;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const activePool = await getPool();
      try {
        await activePool.request().query(`
          IF OBJECT_ID(N'dbo.AppSemanticVectors', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.AppSemanticVectors (
              entityType NVARCHAR(${ENTITY_TYPE_MAX}) NOT NULL,
              entityId NVARCHAR(${ENTITY_ID_MAX}) NOT NULL,
              label NVARCHAR(${LABEL_MAX}) NOT NULL,
              vectorValue VECTOR(${VECTOR_DIMENSIONS}) NULL,
              vectorJson NVARCHAR(MAX) NOT NULL,
              metadata NVARCHAR(MAX) NULL,
              createdAt DATETIME2 NOT NULL CONSTRAINT DF_AppSemanticVectors_createdAt DEFAULT SYSUTCDATETIME(),
              updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppSemanticVectors_updatedAt DEFAULT SYSUTCDATETIME(),
              CONSTRAINT PK_AppSemanticVectors PRIMARY KEY (entityType, entityId)
            )
          END

          IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = N'IX_AppSemanticVectors_TypeLabel'
              AND object_id = OBJECT_ID(N'dbo.AppSemanticVectors')
          )
          BEGIN
            CREATE INDEX IX_AppSemanticVectors_TypeLabel ON dbo.AppSemanticVectors(entityType, label)
          END
        `);
        nativeVectorAvailable = true;
      } catch (error) {
        nativeVectorAvailable = false;
        await activePool.request().query(`
          IF OBJECT_ID(N'dbo.AppSemanticVectors', N'U') IS NULL
          BEGIN
            CREATE TABLE dbo.AppSemanticVectors (
              entityType NVARCHAR(${ENTITY_TYPE_MAX}) NOT NULL,
              entityId NVARCHAR(${ENTITY_ID_MAX}) NOT NULL,
              label NVARCHAR(${LABEL_MAX}) NOT NULL,
              vectorJson NVARCHAR(MAX) NOT NULL,
              metadata NVARCHAR(MAX) NULL,
              createdAt DATETIME2 NOT NULL CONSTRAINT DF_AppSemanticVectors_createdAt DEFAULT SYSUTCDATETIME(),
              updatedAt DATETIME2 NOT NULL CONSTRAINT DF_AppSemanticVectors_updatedAt DEFAULT SYSUTCDATETIME(),
              CONSTRAINT PK_AppSemanticVectors PRIMARY KEY (entityType, entityId)
            )
          END
        `);
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

function aiConfig(store) {
  return store.collection('settings').aiConfig || {};
}

function openAiBaseUrl(value = '') {
  return String(value || '').replace(/\/$/, '');
}

export function vectorSettings() {
  return {
    dimensions: VECTOR_DIMENSIONS,
    duplicateDistance: DUPLICATE_DISTANCE,
    similarDistance: SIMILAR_DISTANCE,
    nativeVectorAvailable
  };
}

export async function embedText(store, text) {
  const input = String(text || '').trim();
  if (!input) throw badRequest('向量化文本不能为空');
  const settings = aiConfig(store);
  if (settings.baseUrl && settings.apiKey) {
    const vector = await requestEmbedding(settings, input).catch(() => null);
    if (Array.isArray(vector?.data?.[0]?.embedding)) {
      return normalizeVector(vector.data[0].embedding);
    }
  }
  return deterministicVector(input);
}

async function requestEmbedding(settings, input) {
  const response = await fetch(`${openAiBaseUrl(settings.baseUrl)}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.embeddingModel || 'text-embedding-3-small',
      input,
      dimensions: VECTOR_DIMENSIONS
    })
  });
  if (!response.ok) return null;
  return response.json();
}

function normalizeVector(source) {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, (_, index) => Number(source[index] || 0));
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / norm).toFixed(8)));
}

function deterministicVector(text) {
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0);
  const tokens = String(text || '').toLowerCase().split(/[\s,，。；;、#]+/).filter(Boolean);
  for (const token of tokens.length ? tokens : [text]) {
    const hash = createHash('sha256').update(token).digest();
    for (let index = 0; index < hash.length; index += 1) {
      const position = (hash[index] + index * 131) % VECTOR_DIMENSIONS;
      vector[position] += hash[index] % 2 === 0 ? 1 : -1;
    }
  }
  return normalizeVector(vector);
}

function entityIdForLabel(entityType, label, explicitId = '') {
  if (explicitId) return String(explicitId).slice(0, ENTITY_ID_MAX);
  return `${entityType}:${createHash('sha1').update(String(label || '')).digest('hex')}`.slice(0, ENTITY_ID_MAX);
}

async function upsertSemanticVector(store, entityType, label, options = {}) {
  await ensureSchema();
  const vector = options.vector || await embedText(store, label);
  const vectorJson = JSON.stringify(vector);
  const entityId = entityIdForLabel(entityType, label, options.entityId);
  const metadata = JSON.stringify(options.metadata || {});
  const activePool = await getPool();
  if (nativeVectorAvailable) {
    try {
      await activePool.request()
        .input('entityType', sql.NVarChar(ENTITY_TYPE_MAX), entityType)
        .input('entityId', sql.NVarChar(ENTITY_ID_MAX), entityId)
        .input('label', sql.NVarChar(LABEL_MAX), String(label).slice(0, LABEL_MAX))
        .input('vectorJson', sql.NVarChar(sql.MAX), vectorJson)
        .input('metadata', sql.NVarChar(sql.MAX), metadata)
        .query(`
          MERGE dbo.AppSemanticVectors AS target
          USING (
            SELECT @entityType AS entityType, @entityId AS entityId, @label AS label,
                   @vectorJson AS vectorJson, @metadata AS metadata
          ) AS source
          ON target.entityType = source.entityType AND target.entityId = source.entityId
          WHEN MATCHED THEN
            UPDATE SET label = source.label,
                       vectorValue = CAST(source.vectorJson AS VECTOR(${VECTOR_DIMENSIONS})),
                       vectorJson = source.vectorJson,
                       metadata = source.metadata,
                       updatedAt = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (entityType, entityId, label, vectorValue, vectorJson, metadata)
            VALUES (source.entityType, source.entityId, source.label, CAST(source.vectorJson AS VECTOR(${VECTOR_DIMENSIONS})), source.vectorJson, source.metadata);
        `);
      return { entityType, entityId, label, vector };
    } catch {
      nativeVectorAvailable = false;
    }
  }
  await activePool.request()
    .input('entityType', sql.NVarChar(ENTITY_TYPE_MAX), entityType)
    .input('entityId', sql.NVarChar(ENTITY_ID_MAX), entityId)
    .input('label', sql.NVarChar(LABEL_MAX), String(label).slice(0, LABEL_MAX))
    .input('vectorJson', sql.NVarChar(sql.MAX), vectorJson)
    .input('metadata', sql.NVarChar(sql.MAX), metadata)
    .query(`
      MERGE dbo.AppSemanticVectors AS target
      USING (
        SELECT @entityType AS entityType, @entityId AS entityId, @label AS label,
               @vectorJson AS vectorJson, @metadata AS metadata
      ) AS source
      ON target.entityType = source.entityType AND target.entityId = source.entityId
      WHEN MATCHED THEN
        UPDATE SET label = source.label,
                   vectorJson = source.vectorJson,
                   metadata = source.metadata,
                   updatedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN
        INSERT (entityType, entityId, label, vectorJson, metadata)
        VALUES (source.entityType, source.entityId, source.label, source.vectorJson, source.metadata);
    `);
  return { entityType, entityId, label, vector };
}

async function listSemanticVectors(entityType) {
  await ensureSchema();
  const activePool = await getPool();
  const result = await activePool.request()
    .input('entityType', sql.NVarChar(ENTITY_TYPE_MAX), entityType)
    .query(`
      SELECT entityType, entityId, label, vectorJson, metadata
      FROM dbo.AppSemanticVectors
      WHERE entityType = @entityType
    `);
  return result.recordset.map((row) => ({
    ...row,
    vector: parseVector(row.vectorJson),
    metadata: parseJson(row.metadata, {})
  }));
}

async function querySimilarVectors(store, entityType, vector, limit = 8) {
  await ensureSchema();
  const vectorJson = JSON.stringify(vector);
  const activePool = await getPool();
  if (nativeVectorAvailable) {
    try {
      const result = await activePool.request()
        .input('entityType', sql.NVarChar(ENTITY_TYPE_MAX), entityType)
        .input('vectorJson', sql.NVarChar(sql.MAX), vectorJson)
        .input('limit', sql.Int, limit)
        .query(`
          DECLARE @query VECTOR(${VECTOR_DIMENSIONS}) = CAST(@vectorJson AS VECTOR(${VECTOR_DIMENSIONS}));
          SELECT TOP (@limit)
            entityType,
            entityId,
            label,
            vectorJson,
            metadata,
            VECTOR_DISTANCE('cosine', vectorValue, @query) AS distance
          FROM dbo.AppSemanticVectors
          WHERE entityType = @entityType AND vectorValue IS NOT NULL
          ORDER BY VECTOR_DISTANCE('cosine', vectorValue, @query) ASC
        `);
      return result.recordset.map((row) => normalizeSimilarRow(row));
    } catch {
      nativeVectorAvailable = false;
    }
  }
  const rows = await listSemanticVectors(entityType);
  return rows
    .map((row) => normalizeSimilarRow({
      ...row,
      distance: 1 - cosineSimilarity(vector, row.vector)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function normalizeSimilarRow(row) {
  const distance = Number(row.distance ?? 1);
  const similarity = Math.max(0, Math.min(1, 1 - distance));
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    label: row.label,
    distance,
    similarity,
    level: distance <= DUPLICATE_DISTANCE ? 'duplicate' : distance <= SIMILAR_DISTANCE ? 'similar' : 'safe',
    metadata: parseJson(row.metadata, {})
  };
}

function parseVector(value) {
  const parsed = parseJson(value, []);
  return Array.isArray(parsed) ? normalizeVector(parsed) : deterministicVector(String(value || ''));
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < Math.min(vecA.length, vecB.length); index += 1) {
    dot += vecA[index] * vecB[index];
    normA += vecA[index] * vecA[index];
    normB += vecB[index] * vecB[index];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function tagLabels(store) {
  return store.collection('tags').map((tag) => ({ id: tag.id || entityIdForLabel('forumTag', tag.name), label: tag.name }));
}

function forumCategoryLabels(store) {
  const defaults = ['纯文字帖子', '图文帖子', '求助帖', '经验分享帖'];
  const names = [
    ...defaults,
    ...store.collection('posts')
      .map((post) => String(post.type || '').trim())
      .filter(Boolean)
  ];
  return [...new Set(names)].map((name) => ({
    id: entityIdForLabel('forumCategory', name),
    label: name
  }));
}

function productCategoryLabels(store) {
  return (store.collection('settings').productCategories || []).map((item) => ({
    id: item.id,
    label: item.name,
    metadata: { parentId: item.parentId || null }
  }));
}

function taskCategoryLabels(store) {
  return (store.collection('settings').taskCategories || []).map((name) => ({
    id: entityIdForLabel('taskCategory', name),
    label: name
  }));
}

function taskTagLabels(store) {
  const names = [...new Set(store.collection('taskKeywords').map((item) => item.keyword).filter(Boolean))];
  return names.map((name) => ({ id: entityIdForLabel('taskTag', name), label: name }));
}

function knowledgeEntryLabels(store) {
  const enabledBaseIds = new Set(
    store.collection('knowledgeBases')
      .filter((base) => !base.deletedAt && base.enabled !== false)
      .map((base) => base.id)
  );
  return store.collection('knowledgeEntries')
    .filter((entry) => !entry.deletedAt)
    .filter((entry) => !entry.knowledgeBaseId || !enabledBaseIds.size || enabledBaseIds.has(entry.knowledgeBaseId))
    .map((entry) => ({
      id: entry.id,
      label: `${entry.title}\n${entry.category || ''}\n${entry.content}`,
      metadata: {
        title: entry.title,
        category: entry.category || '',
        source: entry.source || '',
        knowledgeBaseId: entry.knowledgeBaseId || '',
        updatedAt: entry.updatedAt || entry.createdAt || ''
      }
    }));
}

function labelsForEntity(store, entityType) {
  if (entityType === 'forumTag') return tagLabels(store);
  if (entityType === 'forumCategory') return forumCategoryLabels(store);
  if (entityType === 'productCategory') return productCategoryLabels(store);
  if (entityType === 'taskCategory') return taskCategoryLabels(store);
  if (entityType === 'taskTag') return taskTagLabels(store);
  if (entityType === 'knowledgeEntry') return knowledgeEntryLabels(store);
  return [];
}

async function ensureEntityVectors(store, entityType) {
  const labels = labelsForEntity(store, entityType).filter((item) => item.label);
  const existingById = new Map((await listSemanticVectors(entityType)).map((item) => [item.entityId, item]));
  for (const item of labels) {
    const existing = existingById.get(item.id);
    if (existing && existing.metadata?.updatedAt === item.metadata?.updatedAt) continue;
    if (existing && entityType !== 'knowledgeEntry') continue;
    await upsertSemanticVector(store, entityType, item.label, { entityId: item.id, metadata: item.metadata || {} });
  }
}

export async function checkLabelSimilarity(store, entityType, labels = []) {
  const cleaned = [...new Set((Array.isArray(labels) ? labels : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))];
  if (!cleaned.length) return [];
  await ensureEntityVectors(store, entityType);
  const results = [];
  for (const label of cleaned) {
    const vector = await embedText(store, label);
    const matches = (await querySimilarVectors(store, entityType, vector))
      .filter((item) => item.distance <= SIMILAR_DISTANCE)
      .filter((item) => item.label !== label);
    results.push({ input: label, matches, recommended: matches[0]?.label || label });
  }
  return results;
}

export async function searchKnowledgeVectors(store, keyword = '', limit = 8) {
  const query = String(keyword || '').trim();
  if (!query) return [];
  const entries = knowledgeEntryLabels(store);
  if (!entries.length) return [];
  await ensureEntityVectors(store, 'knowledgeEntry');
  const vector = await embedText(store, query);
  const matches = await querySimilarVectors(store, 'knowledgeEntry', vector, limit);
  const byId = new Map(store.collection('knowledgeEntries').map((entry) => [entry.id, entry]));
  return matches
    .map((match) => {
      const entry = byId.get(match.entityId);
      if (!entry || entry.deletedAt) return null;
      return {
        id: entry.id,
        title: entry.title,
        category: entry.category,
        source: entry.source,
        content: String(entry.content || '').slice(0, 160),
        similarity: match.similarity,
        distance: match.distance
      };
    })
    .filter(Boolean);
}

export async function normalizeLabelsBySimilarity(store, entityType, labels = [], replacements = {}) {
  const cleaned = [...new Set((Array.isArray(labels) ? labels : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean))];
  if (!cleaned.length) return { labels: [], similar: [] };
  const checks = await checkLabelSimilarity(store, entityType, cleaned);
  const similar = [];
  const normalized = [];
  for (const label of cleaned) {
    const replacement = String(replacements[label] || '').trim();
    if (replacement) {
      normalized.push(replacement);
      continue;
    }
    const check = checks.find((item) => item.input === label);
    const duplicate = check?.matches?.find((item) => item.level === 'duplicate');
    if (duplicate) normalized.push(duplicate.label);
    else normalized.push(label);
    if (check?.matches?.some((item) => item.level === 'similar')) similar.push(check);
  }
  return { labels: [...new Set(normalized)].slice(0, 5), similar };
}

async function chatJson(store, system, user, fallback) {
  const settings = aiConfig(store);
  if (!settings.baseUrl || !settings.model || !settings.apiKey) return fallback();
  try {
    const response = await fetch(`${openAiBaseUrl(settings.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      })
    });
    if (!response.ok) return fallback();
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '';
    return parseJson(raw, fallback());
  } catch {
    return fallback();
  }
}

export async function generateForumTags(store, { title = '', content = '' } = {}) {
  const fallback = () => ({
    tags: fallbackKeywords(`${title} ${content}`, 5)
  });
  const result = await chatJson(
    store,
    '你是校园社区帖子标签助手。只输出 JSON，格式为 {"tags":["标签1"]}，生成 3-5 个中文短标签，不要带 #。',
    `标题：${title}\n正文：${content}`,
    fallback
  );
  return [...new Set((result.tags || []).map((item) => String(item || '').replace(/^#/, '').trim()).filter(Boolean))]
    .slice(0, 5);
}

export async function generateTaskTags(store, {
  title = '',
  detail = '',
  category = '',
  deliveryRequirement = ''
} = {}) {
  const source = `${title} ${detail} ${category} ${deliveryRequirement}`;
  const fallback = () => ({
    tags: extractTaskKeywords(source)
  });
  const result = await chatJson(
    store,
    '你是校园任务互助标签助手。只输出 JSON，格式为 {"tags":["标签1"]}，生成 3-5 个中文短标签，不要带 #，标签应体现任务类型、场景或技能需求。',
    [
      `任务标题：${title}`,
      `任务分类：${category}`,
      `任务详情：${detail}`,
      `交付要求：${deliveryRequirement}`
    ].join('\n'),
    fallback
  );
  return [...new Set((result.tags || [])
    .map((item) => String(item || '').replace(/^#/, '').trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 20)))]
    .slice(0, 5);
}

export async function classifyProductCategories(store, { title = '', detail = '' } = {}) {
  const categories = productCategoryLabels(store);
  const fallback = () => ({
    categories: categories
      .filter((item) => `${title} ${detail}`.includes(item.label))
      .slice(0, 3)
      .map((item) => item.id)
  });
  const result = await chatJson(
    store,
    '你是校园二手商品分类助手。只输出 JSON，格式为 {"categoryIds":["cat-id"]}，最多返回 3 个已有分类 id。',
    [
      `商品标题：${title}`,
      `商品描述：${detail}`,
      `可选分类：${categories.map((item) => `${item.id}:${item.label}`).join('；')}`
    ].join('\n'),
    fallback
  );
  const ids = result.categoryIds || result.categories || [];
  return categories.filter((item) => ids.includes(item.id)).slice(0, 3);
}

export async function recommendEntityCategory(store, domain, body = {}) {
  const config = categoryRecommendationConfig(store, domain);
  const current = normalizeCurrentCategory(config, body);
  const text = categoryRecommendationText(domain, body);
  const acceptedLabel = String(body.acceptedLabel || '').trim();
  const apply = Boolean(body.apply);
  const proposal = acceptedLabel
    ? { newLabel: acceptedLabel, reason: '用户确认使用推荐分类' }
    : await generateCategoryRecommendation(store, config, text, current);
  const resolved = await resolveCategoryRecommendation(store, config, proposal, current, apply);
  return {
    domain: config.domain,
    current,
    recommended: resolved.recommended,
    changed: categoryValue(current) !== categoryValue(resolved.recommended),
    applied: resolved.applied,
    reason: proposal.reason || resolved.reason || '',
    similarity: resolved.similarity || []
  };
}

function categoryRecommendationConfig(store, domain) {
  if (domain === 'forum') {
    return {
      domain,
      entityType: 'forumCategory',
      idMode: false,
      categories: forumCategoryLabels(store),
      system: '你是校园社区帖子分类助手。只输出 JSON：{"existingId":"已有分类id或空","existingLabel":"已有分类名或空","newLabel":"新分类名或空","reason":"中文理由"}。如果已有分类不合适，可以给出一个 2-8 字中文新分类；不要输出标签。'
    };
  }
  if (domain === 'task') {
    return {
      domain,
      entityType: 'taskCategory',
      idMode: false,
      categories: taskCategoryLabels(store),
      system: '你是校园任务互助分类助手。只输出 JSON：{"existingId":"已有分类id或空","existingLabel":"已有分类名或空","newLabel":"新分类名或空","reason":"中文理由"}。优先复用已有分类；如果都不合适，可以给出一个 2-8 字中文新任务分类。'
    };
  }
  if (domain === 'product') {
    return {
      domain,
      entityType: 'productCategory',
      idMode: true,
      categories: productCategoryLabels(store),
      system: '你是校园二手商品分类助手。只输出 JSON：{"existingId":"已有分类id或空","existingLabel":"已有分类名或空","newLabel":"新分类名或空","reason":"中文理由"}。优先复用已有分类；如果都不合适，可以给出一个 2-8 字中文新商品分类。'
    };
  }
  throw badRequest('不支持的分类推荐类型');
}

function normalizeCurrentCategory(config, body = {}) {
  const raw = config.domain === 'product'
    ? String(body.categoryId || '').trim()
    : String(body.category || body.type || '').trim();
  const found = config.idMode
    ? config.categories.find((item) => item.id === raw)
    : config.categories.find((item) => item.label === raw);
  if (found) return publicCategoryValue(config, found, false);
  return {
    id: config.idMode ? raw : entityIdForLabel(config.entityType, raw),
    label: raw,
    value: raw,
    isNew: false
  };
}

function categoryRecommendationText(domain, body = {}) {
  if (domain === 'forum') {
    return [
      `标题：${body.title || ''}`,
      `正文：${body.content || ''}`,
      `用户当前选择：${body.type || ''}`,
      `用户标签：${(Array.isArray(body.tags) ? body.tags : []).join('、')}`
    ].join('\n');
  }
  if (domain === 'task') {
    return [
      `任务标题：${body.title || ''}`,
      `任务详情：${body.detail || ''}`,
      `交付要求：${body.deliveryRequirement || ''}`,
      `用户当前选择：${body.category || ''}`,
      `任务标签：${(Array.isArray(body.tags) ? body.tags : []).join('、')}`
    ].join('\n');
  }
  return [
    `商品名称：${body.title || ''}`,
    `商品详情：${body.detail || ''}`,
    `成色：${body.condition || ''}`,
    `交易方式：${body.tradeMethod || ''}`,
    `用户当前选择：${body.categoryId || ''}`
  ].join('\n');
}

async function generateCategoryRecommendation(store, config, text, current) {
  const fallback = () => fallbackCategoryRecommendation(config, text, current);
  return chatJson(
    store,
    config.system,
    [
      text,
      `已有分类：${config.categories.map((item) => `${item.id}:${item.label}`).join('；')}`,
      '判断内容真正所属分类。若用户当前选择不合适，请推荐更合适分类。'
    ].join('\n'),
    fallback
  );
}

function fallbackCategoryRecommendation(config, text, current) {
  const match = config.categories.find((item) => text.includes(item.label));
  if (match) return { existingId: match.id, existingLabel: match.label, reason: '根据内容关键词匹配已有分类' };
  return {
    existingId: current?.id || '',
    existingLabel: current?.label || '',
    reason: '未配置 AI，保留当前分类'
  };
}

async function resolveCategoryRecommendation(store, config, proposal = {}, current, apply) {
  const existing = findCategoryByProposal(config, proposal);
  if (existing) {
    return {
      recommended: publicCategoryValue(config, existing, false),
      applied: false,
      reason: proposal.reason || ''
    };
  }

  const newLabel = sanitizeCategoryLabel(proposal.newLabel || proposal.category || proposal.label);
  if (!newLabel) {
    return {
      recommended: current,
      applied: false,
      reason: proposal.reason || ''
    };
  }
  const exactExisting = config.categories.find((item) => item.label === newLabel);
  if (exactExisting) {
    return {
      recommended: publicCategoryValue(config, exactExisting, false),
      applied: false,
      reason: proposal.reason || 'AI 推荐复用已有分类'
    };
  }

  const checks = await checkLabelSimilarity(store, config.entityType, [newLabel]);
  const matches = checks[0]?.matches || [];
  const nearest = matches.find((item) => item.level === 'duplicate' || item.level === 'similar');
  if (nearest) {
    return {
      recommended: publicCategoryValue(config, {
        id: nearest.entityId,
        label: nearest.label
      }, false),
      applied: false,
      reason: `推荐分类与已有分类「${nearest.label}」相似，已优先复用已有分类`,
      similarity: matches
    };
  }

  if (!apply) {
    return {
      recommended: {
        id: '',
        label: newLabel,
        value: newLabel,
        isNew: true
      },
      applied: false,
      reason: proposal.reason || 'AI 建议新增分类',
      similarity: matches
    };
  }

  const created = await createRecommendedCategory(store, config, newLabel);
  return {
    recommended: created,
    applied: true,
    reason: proposal.reason || 'AI 已新增分类',
    similarity: matches
  };
}

function findCategoryByProposal(config, proposal = {}) {
  const existingId = String(proposal.existingId || proposal.categoryId || '').trim();
  const existingLabel = sanitizeCategoryLabel(proposal.existingLabel || proposal.categoryName || '');
  return config.categories.find((item) => existingId && item.id === existingId)
    || config.categories.find((item) => existingLabel && item.label === existingLabel)
    || null;
}

function sanitizeCategoryLabel(value) {
  return String(value || '')
    .replace(/^#/, '')
    .trim()
    .slice(0, 20);
}

async function createRecommendedCategory(store, config, label) {
  const existing = config.categories.find((item) => item.label === label);
  if (existing) return publicCategoryValue(config, existing, false);

  if (config.domain === 'product') {
    const settings = store.collection('settings');
    const category = {
      id: `cat-${Date.now()}`,
      name: label,
      parentId: null
    };
    await store.updateSettings({ productCategories: [...(settings.productCategories || []), category] });
    await upsertSemanticVector(store, config.entityType, category.name, { entityId: category.id, metadata: { parentId: null } });
    return publicCategoryValue(config, { id: category.id, label: category.name }, true);
  }

  if (config.domain === 'task') {
    const settings = store.collection('settings');
    await store.updateSettings({ taskCategories: [...new Set([...(settings.taskCategories || []), label])] });
    await upsertSemanticVector(store, config.entityType, label, { entityId: entityIdForLabel(config.entityType, label) });
    return publicCategoryValue(config, { id: entityIdForLabel(config.entityType, label), label }, true);
  }

  await upsertSemanticVector(store, config.entityType, label, { entityId: entityIdForLabel(config.entityType, label) });
  return publicCategoryValue(config, { id: entityIdForLabel(config.entityType, label), label }, true);
}

function publicCategoryValue(config, category, isNew = false) {
  return {
    id: category.id,
    label: category.label,
    value: config.idMode ? category.id : category.label,
    isNew
  };
}

function categoryValue(category) {
  return String(category?.value || category?.label || category?.id || '');
}

export async function requestNewCategoryWithSimilarity(store, user, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('请输入分类名称');
  const parentId = body.parentId || null;
  assertCategoryDepth(store, parentId);
  const reason = String(body.reason || '').trim();
  const checks = await checkLabelSimilarity(store, 'productCategory', [name]);
  const matches = checks[0]?.matches || [];
  const duplicate = matches.find((item) => item.level === 'duplicate');
  if (duplicate) {
    return { status: 'duplicate', message: '分类已存在', matches };
  }
  if (matches.some((item) => item.level === 'similar') && !body.forcePending) {
    const request = await store.insert('categoryRequests', {
      userId: user.id,
      name,
      parentId,
      reason,
      status: 'similar_pending',
      similarMatches: matches,
      handledAt: '',
      rejectReason: ''
    });
    return { status: 'similar', request, matches };
  }
  const request = await store.insert('categoryRequests', {
    userId: user.id,
    name,
    parentId,
    reason,
    status: 'pending',
    similarMatches: matches,
    handledAt: '',
    rejectReason: ''
  });
  return { status: 'pending', request, matches };
}

export async function requestNewTaskCategoryWithSimilarity(store, user, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw badRequest('请输入任务分类名称');
  const reason = String(body.reason || '').trim();
  const checks = await checkLabelSimilarity(store, 'taskCategory', [name]);
  const matches = checks[0]?.matches || [];
  const duplicate = matches.find((item) => item.level === 'duplicate');
  if (duplicate) {
    return { status: 'duplicate', message: '任务分类已存在', matches };
  }
  if (matches.some((item) => item.level === 'similar') && !body.forcePending) {
    const request = await store.insert('taskCategoryRequests', {
      userId: user.id,
      name,
      reason,
      status: 'similar_pending',
      similarMatches: matches,
      handledAt: '',
      rejectReason: ''
    });
    return { status: 'similar', request, matches };
  }
  const request = await store.insert('taskCategoryRequests', {
    userId: user.id,
    name,
    reason,
    status: 'pending',
    similarMatches: matches,
    handledAt: '',
    rejectReason: ''
  });
  return { status: 'pending', request, matches };
}

function assertCategoryDepth(store, parentId) {
  if (!parentId) return;
  const categories = store.collection('settings').productCategories || [];
  let depth = 1;
  let current = categories.find((item) => item.id === parentId);
  while (current?.parentId) {
    depth += 1;
    current = categories.find((item) => item.id === current.parentId);
  }
  if (depth >= 3) throw badRequest('商品分类最多支持三级，不能继续添加子分类');
}

export async function arbitrateProductCategory(store, user, body = {}) {
  const requestId = String(body.requestId || '').trim();
  const request = store.collection('categoryRequests').find((item) => item.id === requestId && item.userId === user.id);
  if (!request) throw badRequest('分类申请不存在');
  const result = await chatJson(
    store,
    '你是校园二手市场分类仲裁员。只输出 JSON：{"approved":true或false,"reason":"中文理由"}。判断新分类是否应该独立存在，而不是已有分类同义词。',
    [
      `申请分类：${request.name}`,
      `申请理由：${request.reason || ''}`,
      `相似分类：${(request.similarMatches || []).map((item) => `${item.label}(${item.similarity?.toFixed?.(2) || item.similarity})`).join('；')}`
    ].join('\n'),
    () => ({ approved: false, reason: '未配置 AI，无法完成仲裁' })
  );
  if (!result.approved) {
    await store.update('categoryRequests', request.id, {
      status: 'ai_rejected',
      rejectReason: result.reason || 'AI 仲裁未通过',
      handledAt: now()
    });
    return { approved: false, reason: result.reason || 'AI 仲裁未通过' };
  }
  const settings = store.collection('settings');
  const category = {
    id: `cat-${Date.now()}`,
    name: request.name,
    parentId: request.parentId || null
  };
  await store.updateSettings({ productCategories: [...(settings.productCategories || []), category] });
  await store.update('categoryRequests', request.id, {
    status: 'ai_approved',
    handledAt: now(),
    rejectReason: ''
  });
  await upsertSemanticVector(store, 'productCategory', category.name, { entityId: category.id, metadata: { parentId: category.parentId } });
  return { approved: true, reason: result.reason || 'AI 仲裁通过', category };
}

export async function arbitrateTaskCategory(store, user, body = {}) {
  const requestId = String(body.requestId || '').trim();
  const request = store.collection('taskCategoryRequests').find((item) => item.id === requestId && item.userId === user.id);
  if (!request) throw badRequest('任务分类申请不存在');
  const result = await chatJson(
    store,
    '你是校园任务互助分类仲裁员。只输出 JSON：{"approved":true或false,"reason":"中文理由"}。判断新任务分类是否应该独立存在，而不是已有分类同义词。',
    [
      `申请任务分类：${request.name}`,
      `申请理由：${request.reason || ''}`,
      `相似任务分类：${(request.similarMatches || []).map((item) => `${item.label}(${item.similarity?.toFixed?.(2) || item.similarity})`).join('；')}`
    ].join('\n'),
    () => ({ approved: false, reason: '未配置 AI，无法完成仲裁' })
  );
  if (!result.approved) {
    await store.update('taskCategoryRequests', request.id, {
      status: 'ai_rejected',
      rejectReason: result.reason || 'AI 仲裁未通过',
      handledAt: now()
    });
    return { approved: false, reason: result.reason || 'AI 仲裁未通过' };
  }
  const settings = store.collection('settings');
  const category = request.name;
  await store.updateSettings({ taskCategories: [...new Set([...(settings.taskCategories || []), category])] });
  await store.update('taskCategoryRequests', request.id, {
    status: 'ai_approved',
    handledAt: now(),
    rejectReason: ''
  });
  await upsertSemanticVector(store, 'taskCategory', category, { entityId: entityIdForLabel('taskCategory', category) });
  return { approved: true, reason: result.reason || 'AI 仲裁通过', category };
}

function fallbackKeywords(text, limit = 5) {
  const words = String(text || '')
    .replace(/[^\p{Script=Han}\w\s]/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 20);
  return [...new Set(words)].slice(0, limit).length
    ? [...new Set(words)].slice(0, limit)
    : ['校园生活', '经验分享', '互助'];
}
