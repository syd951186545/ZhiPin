-- 候选人去重：添加 unique constraint，支持 upsert 操作
-- 去重键：(tenant_id, source, name, job_id)
-- 替换应用层 SELECT+INSERT 去重（有 1000 条分页限制的静默 bug）

ALTER TABLE candidates
  ADD CONSTRAINT candidates_tenant_source_name_job_unique
  UNIQUE (tenant_id, source, name, job_id);
