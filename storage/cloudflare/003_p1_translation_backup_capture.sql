-- Bind order: batch_id, captured_at_ms, item_id.
-- Copies ALL existing user-visible news and Hebrew translation columns.
-- If either row is missing, records nothing; duplicate batch ids abort.
INSERT INTO regional_translation_repair_backups
(batch_id,item_id,captured_at_ms,news_json,hebrew_json)
SELECT ?, n.id, ?,
  json_object(
    'id',n.id,'source',n.source,'headline',n.headline,
    'headline_ru',n.headline_ru,'summary',n.summary,'summary_ru',n.summary_ru,
    'url',n.url,'published_ms',n.published_ms,'discovered_ms',n.discovered_ms,
    'priority',n.priority,'comment',n.comment,'comment_model',n.comment_model,
    'comment_at_ms',n.comment_at_ms
  ),
  json_object(
    'kind',h.kind,'item_id',h.item_id,'language',h.language,
    'source_hash',h.source_hash,'title',h.title,'body',h.body,
    'commentary',h.commentary,'quality_score',h.quality_score,
    'model',h.model,'created_at_ms',h.created_at_ms
  )
FROM news_items n
JOIN regional_i18n h ON h.item_id=n.id AND h.kind='news' AND h.language='he'
WHERE n.id=?;
