import { Lucia, TimeSpan } from 'lucia';
import { PostgresJsAdapter } from "@lucia-auth/adapter-postgresql";
import { db } from './db.js';

declare module 'lucia' {
	interface Register {
		Lucia: typeof auth;
		DatabaseUserAttributes: DatabaseUserAttributes;
	}
}

interface DatabaseUserAttributes {
  username: string;
  password: string
  name: string,
}

const adapter = new PostgresJsAdapter(db, {
    user: 'v3.users',
    session: 'v3.user_session',
});

export const auth = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(1, 'h'),
  getUserAttributes: (attributes) => {
    return {
      username: attributes.username,
      password: attributes.password,
      name: attributes.name,
    };
  }
});
