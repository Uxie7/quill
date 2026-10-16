import { Client, Connection } from '@temporalio/client';
import { cfg } from './config';

let client: Client | undefined;
export async function temporal(): Promise<Client> {
  if (!client) client = new Client({ connection: await Connection.connect({ address: cfg.temporalAddress }) });
  return client;
}
