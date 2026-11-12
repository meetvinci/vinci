import { authedRouter, ownerRouter } from './rpc.procedures';

export const todos = {
  list: ownerRouter.todos.list.handler(async ({ context, input }) => context.todos.queries.list(input)),
  create: authedRouter.todos.create.handler(async ({ context, input }) => context.todos.actions.create(input)),
  update: authedRouter.todos.update.handler(async ({ context, input }) => context.todos.actions.update(input)),
  reorder: authedRouter.todos.reorder.handler(async ({ context, input }) => context.todos.actions.reorder(input)),
  remove: authedRouter.todos.remove.handler(async ({ context, input }) => context.todos.actions.remove(input)),
};
