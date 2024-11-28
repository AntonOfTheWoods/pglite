import { faker } from '@faker-js/faker';
import { generateNKeysBetween } from 'fractional-indexing';
import { v4 as uuidv4 } from 'uuid';

const { person, internet } = faker;

const NB_USERS = 5;

export const JANE_DOE = {
  id: uuidv4(),
  first_name: "Jane",
  last_name: "Doe",
  email: "janedoe@pglite.dev",
  role: "admin",
};

export const JOE_BLOGGS = {
  id: uuidv4(),
  first_name: "Joe",
  last_name: "Bloggs",
  email: "joebloggs@pglite.dev",
  role: "user",
};

export function generateUsers() {
  const randomUsers = Array.from(Array(NB_USERS - 2).keys()).map(() => {
    const first_name = person.firstName();
    const last_name = person.lastName();
    const email = internet.email({
      firstName: first_name,
      lastName: last_name,
    });

    return {
      id: uuidv4(),
      first_name,
      last_name,
      email,
      role: "user",
    };
  });
  return [JANE_DOE, JOE_BLOGGS, ...randomUsers];
}

export function generateIssues(numIssues) {
  // generate properly spaced kanban keys and shuffle them
  const users = generateUsers();
  const kanbanKeys = faker.helpers.shuffle(
    generateNKeysBetween(null, null, numIssues)
  );
  return [Array.from({ length: numIssues }, (_, idx) =>
    generateIssue(kanbanKeys[idx], users)
  ), users];
}

function generateIssue(kanbanKey, users) {
  const issueId = uuidv4();
  const createdAt = faker.date.past();
  const user = (faker.number.int(2) === 0
    ? users.find((x) => x.email === JANE_DOE.email).id
    : faker.helpers.arrayElement(users).id).toString();

  return {
    id: issueId,
    title: faker.lorem.sentence({ min: 3, max: 8 }),
    description: faker.lorem.sentences({ min: 2, max: 6 }, `\n`),
    priority: faker.helpers.arrayElement([`none`, `low`, `medium`, `high`]),
    status: faker.helpers.arrayElement([
      `backlog`,
      `todo`,
      `in_progress`,
      `done`,
      `canceled`,
    ]),
    created: createdAt.toISOString(),
    modified: faker.date
      .between({ from: createdAt, to: new Date() })
      .toISOString(),
    kanbanorder: kanbanKey,
    // username: faker.internet.userName(),
    user_id: user.id,
    comments: faker.helpers.multiple(
      () => generateComment(issueId, createdAt, users),
      { count: faker.number.int({ min: 0, max: 10 }) }
    ),
  };
}

function generateComment(issueId, issueCreatedAt, users) {
  const createdAt = faker.date.between({ from: issueCreatedAt, to: new Date() });
  const user = (faker.number.int(2) === 0
    ? users.find((x) => x.email === JANE_DOE.email).id
    : faker.helpers.arrayElement(users).id).toString();

  return {
    id: uuidv4(),
    body: faker.lorem.text(),
    // username: faker.internet.userName(),
    user_id: user.id,
    issue_id: issueId,
    created: createdAt.toISOString(),
    modified: createdAt.toISOString(), // comments are never modified
  };
}
