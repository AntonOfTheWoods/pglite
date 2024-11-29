import { createClient } from "@supabase/supabase-js";
import { generateIssues } from './generate_data.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_SERVICE_KEY
);

let usersToDelete = await supabase.auth.admin.listUsers();
const deleteUsers = await Promise.all(
  usersToDelete.data?.users.map((user) =>
    supabase.auth.admin.deleteUser(user.id, false)
  )
);
for (const result of deleteUsers) {
  if (result.error) {
    throw result.error;
  }
}

const ISSUES_TO_LOAD = process.env.ISSUES_TO_LOAD || 512;
const [issues, users] = generateIssues(ISSUES_TO_LOAD);

const sUsers = await supabase.auth.admin.listUsers();
for (const user of users) {
  if (!sUsers.data?.users.find((sUser) => sUser.email === user.email)) {
    const { error } = await supabase.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: "a_good_password",
      email_confirm: true,
      app_metadata: { roles: [user.role] }
    });

    if (error) {
      throw error;
    }
  }
}

const BATCH_SIZE = 1000;

async function batchInserts(table, items, total) {

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = items
      .slice(i, i + BATCH_SIZE);


    const { error: errorUsers } = await supabase
      .from(table)
      .insert(batch)
      .select();
    if (errorUsers) throw new Error(errorUsers);

    process.stdout.write(
      `Loaded ${Math.min(i + BATCH_SIZE, total)} of ${total} ${table}s\r`
    );
  }
}
await batchInserts("profiles", users.map(({ first_name, last_name, email, role, ...rest }) => rest), users.length);
await batchInserts("issue", issues.map(({ comments: _, ...rest }) => rest), issues.length);
const allComments = issues.flatMap((issue) => issue.comments);
await batchInserts("comment", allComments, allComments.length);

process.stdout.write(`\n`);

console.info(`Loaded ${users.length} users with ${issues.length} issues with ${allComments.length} comments.`);
