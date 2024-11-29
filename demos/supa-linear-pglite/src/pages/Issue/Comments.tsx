import { useLiveQuery, usePGlite } from '@electric-sql/pglite-react'
import { useUser } from '@supabase/auth-helpers-react'
import { useEffect, useState } from 'react'
import {
  BsCloudCheck as SyncedIcon,
  BsCloudSlash as UnsyncedIcon,
} from 'react-icons/bs'
import ReactMarkdown from 'react-markdown'

import Avatar from '../../components/Avatar'
import Editor from '../../components/editor/Editor'
import { Comment, Issue } from '../../types/types'
import { formatDate } from '../../utils/date'
import { showWarning } from '../../utils/notification'

export interface CommentsProps {
  issue: Issue
}

function CommentBlock({ comment }: { comment: Comment }) {
  const pg = usePGlite()
  const [username, setUsername] = useState<string>()

  useEffect(() => {
    if (comment) {
      pg.query<{ username: string }>(
        `
          select username from profiles where id = $1
        `,
        [comment.user_id]
      ).then((result) => {
        setUsername(result.rows?.[0]?.username || 'Unknown User')
      })
    }
  }, [pg, comment])

  return (
    <div
      key={comment.id}
      className="flex flex-col w-full p-3 mb-3 bg-white rounded shadow-sm border"
    >
      <div className="flex items-center mb-2">
        <Avatar name={username} />
        <span className="ms-2 text-sm text-gray-400">{username}</span>
        <span className=" ms-auto text-sm text-gray-400 ml-2">
          {formatDate(comment.created)}
        </span>
        <span className="ms-2">
          {/* Synced status */}
          {comment.synced ? (
            <SyncedIcon className="text-green-500 w-4 h-4" />
          ) : (
            <UnsyncedIcon className="text-orange-500 w-4 h-4" />
          )}
        </span>
      </div>
      <div className="mt-2 text-md prose w-full max-w-full">
        <ReactMarkdown>{comment.body}</ReactMarkdown>
      </div>
    </div>
  )
}

function Comments({ issue }: CommentsProps) {
  const pg = usePGlite()
  const user = useUser()
  const [newCommentBody, setNewCommentBody] = useState<string>(``)
  const commentsResults = useLiveQuery.sql<Comment>`
    SELECT * FROM comment WHERE issue_id = ${issue.id}
  `
  const comments = commentsResults?.rows
  const commentList = () => {
    if (comments && comments.length > 0) {
      return comments.map((comment) => (
        <CommentBlock key={comment.id} comment={comment} />
      ))
    }
  }

  const handlePost = () => {
    if (!newCommentBody) {
      showWarning(
        `Please enter a comment before submitting`,
        `Comment required`
      )
      return
    }

    pg.sql`
      INSERT INTO comment (id, issue_id, body, created, user_id)
      VALUES (
        ${crypto.randomUUID()},
        ${issue.id},
        ${newCommentBody},
        ${new Date()},
        ${user?.id}
      )
    `

    setNewCommentBody(``)
  }

  return (
    <>
      {commentList()}
      <div className="w-full max-w-full mt-2 min-h-14 ">
        <Editor
          className="prose font-normal p-3 appearance-none text-md shadow-sm rounded border border-gray-200 editor"
          value={newCommentBody}
          onChange={(val) => setNewCommentBody(val)}
          placeholder="Add a comment..."
        />
      </div>
      <div className="flex w-full py-3">
        <button
          type="button"
          className="px-3 ml-auto text-white bg-indigo-600 rounded hover:bg-indigo-700 h-7"
          onClick={handlePost}
        >
          Post Comment
        </button>
      </div>
    </>
  )
}

export default Comments
