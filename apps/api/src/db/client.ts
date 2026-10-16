import { MongoClient, Db, ObjectId, Collection } from 'mongodb';
import { cfg } from '../config';

export type Doc = { _id: string; [k: string]: any };
let db: Db | undefined;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const client = new MongoClient(cfg.mongo);
  await client.connect();
  db = client.db();
  await db.collection('actions').createIndex({ idempotencyKey: 1 }, { unique: true });
  await db.collection('commitments').createIndex({ clientId: 1, status: 1 });
  await db.collection('chunks').createIndex({ clientId: 1, callId: 1 });
  await db.collection('steps').createIndex({ callId: 1, idx: 1 });
  return db;
}
export async function col(name: string): Promise<Collection<Doc>> {
  return (await getDb()).collection<Doc>(name);
}
export const newId = () => new ObjectId().toHexString();
