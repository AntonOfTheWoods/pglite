import { z } from 'zod'
import {
  deleted,
  idColumn,
  isNew,
  modified,
  modifiedColumns,
} from '../plugins/pglite-writesync/consts'

const syncChangeSchema = z.object({
  [idColumn]: z.string(),
  [modifiedColumns]: z.array(z.string()).nullable().optional(),
  [deleted]: z.boolean().nullable().optional(),
  [isNew]: z.boolean().nullable().optional(),
  [modified]: z.string().nullable().optional(),
})

const commonChangeSchema = syncChangeSchema.merge(
  z.object({
    created: z.string().nullable().optional(),
    user_id: z.string().nullable().optional(),
  })
)

export const issueChangeSchema = commonChangeSchema.merge(
  z.object({
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    priority: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    kanbanorder: z.string().nullable().optional(),
  })
)

export type IssueChange = z.infer<typeof issueChangeSchema>

export const commentChangeSchema = commonChangeSchema.merge(
  z.object({
    body: z.string().nullable().optional(),
    issue_id: z.string().nullable().optional(),
  })
)

export type CommentChange = z.infer<typeof commentChangeSchema>

export const changeSetSchema = z.object({
  issue: z.array(issueChangeSchema),
  comment: z.array(commentChangeSchema),
})

export type ChangeSet = z.infer<typeof changeSetSchema>

export type ServerChangeable = IssueChange | CommentChange

export const READWRITE_SYNC_TABLES = ['issue', 'comment']
export const READ_SYNC_TABLES = ['profiles', ...READWRITE_SYNC_TABLES]
export const WRITE_SYNC_TABLES = READWRITE_SYNC_TABLES
