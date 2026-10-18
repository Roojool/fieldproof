import { createWorkspace, readWorkspace, editWorkspace, closeGraphConnection } from './src/lib/graph';
import { createFixture } from './src/lib/business-setup';

async function main(): Promise<void> {
  const id = 'dbg-assign-' + Date.now();
  const ws = createFixture(id, 'S1');
  await createWorkspace(id, ws);
  const before = await readWorkspace(id);
  if (!before) throw new Error(`workspace ${id} not found`);
  // eslint-disable-next-line no-console
  console.log('before wo-115 assigned:', before.workOrders.find((o) => o.id === 'wo-115')?.assignedTechnicianId);
  const updated = await editWorkspace(id, before.revision, {
    kind: 'assign-technician', workOrderId: 'wo-115', technicianId: 'tech-ravi',
  });
  // eslint-disable-next-line no-console
  console.log('after wo-115 assigned:', updated.workOrders.find((o) => o.id === 'wo-115')?.assignedTechnicianId);
  await closeGraphConnection();
}
main().catch((e) => { console.error(e); process.exit(1); });
