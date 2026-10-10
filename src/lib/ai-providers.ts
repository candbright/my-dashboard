/**
 * Shared AI provider vocabulary.
 *
 * The provider *list* is owned by the server: it is the merge of a built-in
 * catalogue and any provider an administrator has added. This module therefore
 * holds only what the browser must know without asking — the protocol enum and
 * its labels — plus the wire shapes of the payloads.
 *
 * It deliberately does NOT contain a second copy of the provider presets. There
 * used to be one here, matching a third copy in the Go backend, and the three
 * drifted: the frontend offered a zhipu endpoint the backend no longer used, and
 * neither could see a provider the other had added. One list, owned by the
 * server, is the fix.
 */

/** Wire protocol a provider speaks. Mirrors the backend's three-value enum. */
export type AIProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages';

/** Protocol display order; the first entry is the default. */
export const AI_PROTOCOLS: AIProtocol[] = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages',
];

export const AI_PROTOCOL_LABELS: Record<AIProtocol, string> = {
  'openai-completions': 'OpenAI 兼容（/chat/completions）',
  'openai-responses': 'OpenAI Responses（/responses）',
  'anthropic-messages': 'Anthropic Messages（/messages）',
};

/** One provider as the settings pages render it. */
export interface ProviderView {
  id: string;
  name: string;
  baseUrl: string;
  protocol: AIProtocol;
  protocolLabel: string;
  models: string[];
  /** The ONE enabled model; the per-model switches are a radio group over it. */
  activeModel: string;
  keyUrl?: string;
  status: string;
  /** Whether the provider is fully defined, so it can be selected at all. */
  selectable: boolean;
  /** True for entries from the server's built-in catalogue. */
  builtin: boolean;
  /**
   * Whether an administrator actually added this provider to the list.
   *
   * This is NOT the inverse of `builtin`: a catalogue vendor only enters the list
   * once someone adds it from the picker. The settings pages render only `added`
   * providers, which is what keeps the built-in vendors inside the picker.
   */
  added: boolean;
  /**
   * "personal" = the caller's own entry (visible to nobody else), "global" =
   * the shared list an administrator maintains. Same creation flow, different
   * configurations.
   */
  scope: 'global' | 'personal';
  /** Whether the CALLER may edit/delete/retoggle this row. */
  manageable: boolean;
  /** Whether the server holds a credential for this provider. */
  keyConfigured: boolean;
  /** Whether this is the provider the global API spends. */
  isGlobalActive: boolean;
  /** The provider's default model. */
  model: string;
  /** Whether this is the caller's own selected provider. */
  active: boolean;
}

/** One model as reported by a provider's discovery endpoint. */
export interface DiscoveredModel {
  id: string;
  name: string;
}

/** A provider definition as submitted by the add/edit forms. */
export interface ProviderDraft {
  id: string;
  name: string;
  baseUrl: string;
  protocol: AIProtocol;
  models: string[];
  activeModel?: string;
  keyUrl?: string;
}

/** One entry of the server's built-in catalogue, for the add-provider picker. */
export interface CatalogEntry {
  id: string;
  name: string;
  baseUrl: string;
  protocol: AIProtocol;
  models: string[];
  keyUrl?: string;
  /** True when this catalogue entry is already in the active list. */
  alreadyAdded: boolean;
}

export interface ProviderListPayload {
  success: boolean;
  protocols: { value: AIProtocol; label: string }[];
  providers: ProviderView[];
  cleanedUpUserIds?: string[];
}

export interface CatalogPayload {
  success: boolean;
  catalog: CatalogEntry[];
}

/** Global-API state as shown on the administrator's page. */
export interface GlobalAIState {
  success: boolean;
  activeProviderId: string;
  activeProviderName: string;
  hasKey: boolean;
  model: string;
  ready: boolean;
  pendingRequests: ApprovalRequestView[];
  encryptionReady: boolean;
}

/** The caller's own AI settings. */
export interface UserAIState {
  success: boolean;
  providers: ProviderView[];
  protocols: { value: AIProtocol; label: string }[];
  globalApiEnabled: boolean;
  holdsGrant: boolean;
  hasPendingRequest: boolean;
  globalReady: boolean;
  globalProviderId: string;
  personalProviderId: string;
  hasPersonalKey: boolean;
  model: string;
  /** Which credential an AI request would actually spend. */
  resolvedSource: '' | 'global' | 'personal';
  isGuest: boolean;
  aiEnabled: boolean;
}

/** One row of the approvals queue. */
export interface ApprovalRequestView {
  id: string;
  resourceType: string;
  resourceId: string;
  permission: string;
  resourceTypeLabel: string;
  permissionLabel: string;
  userId: string;
  username: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewerId: string;
  reviewReason: string;
  reviewedAt: string;
  createdAt: string;
  /** Resource-specific display fields, merged in flat by the server. */
  title?: string;
  slug?: string;
  visibility?: string;
  missing?: boolean;
}

export interface ApprovalListPayload {
  success: boolean;
  requests: ApprovalRequestView[];
  total: number;
  counts: Record<string, number>;
  allTotal: number;
}

export interface MyPermissionsPayload {
  success: boolean;
  grants: {
    resourceType: string;
    resourceId: string;
    permission: string;
    label: string;
    grantedAt: string;
  }[];
  requests: ApprovalRequestView[];
  hasGlobalAI: boolean;
}

/**
 * The resource-type filters the approvals queue offers.
 *
 * `all` is a client-side concept: the server returns everything when no type is
 * given, so it is not a resource type and is never sent as one.
 */
export const APPROVAL_FILTERS: { key: string; label: string; resourceType: string }[] = [
  { key: 'all', label: '全部', resourceType: '' },
  { key: 'resume', label: '简历公开', resourceType: 'resume' },
  { key: 'ai', label: '全局 API', resourceType: 'ai' },
];
