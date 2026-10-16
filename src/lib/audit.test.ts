import { describe, it, expect } from 'vitest';
import { buildAuditQuery, outcomeLabel, payloadSummary, resourceTypeLabel } from './audit';

describe('payloadSummary', () => {
  it('joins field names without dumping JSON', () => {
    expect(payloadSummary({ fields: ['email', 'username'] })).toBe('字段：email、username');
  });

  it('renders a role change as before → after', () => {
    expect(payloadSummary({ before: 'user', after: 'admin' })).toBe('user → admin');
  });

  it('labels an AI kind tag in Chinese', () => {
    expect(payloadSummary({ kind: 'key_rotate', providerId: 'openai' })).toBe('轮换密钥');
  });

  it('returns empty for a missing payload', () => {
    expect(payloadSummary(null)).toBe('');
    expect(payloadSummary(undefined)).toBe('');
  });
});

describe('labels', () => {
  it('maps known outcomes', () => {
    expect(outcomeLabel('denied')).toBe('拒绝');
    expect(outcomeLabel('success')).toBe('成功');
  });

  it('maps known resource types', () => {
    expect(resourceTypeLabel('resume')).toBe('简历');
    expect(resourceTypeLabel('grant')).toBe('授权');
  });
});

describe('buildAuditQuery', () => {
  it('omits empty values', () => {
    expect(buildAuditQuery({ action: 'user.role.change', email: '' })).toBe('?action=user.role.change');
  });
});
