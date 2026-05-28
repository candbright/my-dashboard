/**
 * Shared TypeScript types for the application.
 * These types mirror the kratos-server API response shapes.
 */

export type UserRole = 'admin' | 'user';
export type Visibility = 'public' | 'private';
export type ApprovalStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface ResumeRecord {
  id: string;
  user_id: string | null;
  title: string;
  slug: string;
  filename: string;
  name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  website: string | null;
  github: string | null;
  linkedin: string | null;
  avatar: string | null;
  summary: string | null;
  visibility: Visibility;
  approval_status: ApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  avatar: string | null;
  created_at: string;
}

export interface ResumePermissions {
  can_edit: boolean;
  can_delete: boolean;
  can_view_source: boolean;
  can_export_pdf: boolean;
  can_change_visibility: boolean;
  is_owner: boolean;
  is_admin: boolean;
}
