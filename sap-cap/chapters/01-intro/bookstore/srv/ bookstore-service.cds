using my.bookstore as db from '../db/schema';

service BookstoreService {
  entity Books as projection on db.Books;
}