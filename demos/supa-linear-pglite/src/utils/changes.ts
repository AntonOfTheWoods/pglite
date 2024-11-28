import { z } from 'zod'

const syncChangeSchema = z.object({
  id: z.string(),
  modified_columns: z.array(z.string()).nullable().optional(),
  deleted: z.boolean().nullable().optional(),
  new: z.boolean().nullable().optional(),
})

const commonChangeSchema = syncChangeSchema.merge(
  z.object({
    modified: z.string().nullable().optional(),
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
  issues: z.array(issueChangeSchema),
  comments: z.array(commentChangeSchema),
})

export type ChangeSet = z.infer<typeof changeSetSchema>
