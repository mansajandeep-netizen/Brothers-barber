import { settingsRepo, hoursRepo } from './settings.js';
import { servicesRepo, barbersRepo } from './catalog.js';
import { appointmentsRepo, customersRepo, blocksRepo, reviewsRepo } from './appointments.js';
import { usersRepo, sessionsRepo } from '../lib/auth.js';

/** All data access for the app, bound to one database connection. */
export function createStore(db, { sessionDays = 7 } = {}) {
  return {
    db,
    settings: settingsRepo(db),
    hours: hoursRepo(db),
    services: servicesRepo(db),
    barbers: barbersRepo(db),
    appointments: appointmentsRepo(db),
    customers: customersRepo(db),
    blocks: blocksRepo(db),
    reviews: reviewsRepo(db),
    users: usersRepo(db),
    sessions: sessionsRepo(db, { days: sessionDays }),
    emailLog: {
      add: (e) =>
        db.run('INSERT INTO email_log (to_addr, subject, provider, status, error) VALUES (?, ?, ?, ?, ?)', [
          e.to,
          e.subject,
          e.provider,
          e.status,
          e.error ?? null,
        ]),
      recent: (limit = 20) => db.all('SELECT * FROM email_log ORDER BY id DESC LIMIT ?', [limit]),
    },
  };
}
