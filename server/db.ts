import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let database: Db | null = null;

export async function getDb(): Promise<Db> {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME;

  if (!uri || !dbName) {
    throw new Error("Missing MONGODB_URI or MONGODB_DB_NAME");
  }

  client = new MongoClient(uri);
  await client.connect();
  database = client.db(dbName);
  return database;
}

