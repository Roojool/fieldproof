import { createWorkspace, readWorkspace, editWorkspace, closeGraphConnection } from './src/lib/graph.ts';
import { createFixture } from './src/lib/business-setup.ts';

const id = 'ws-debug-assign-' + Date.now();
const ws = createFixture(id, 'S1');
await createWorkspace(id, ws);
const before = await readWorkspace(id);
console.log('BEFORE wo-115 assigned:', before.workOrders.find((o) => o.id === 'wo-115')?.assignedTechnicianId);
const updated = await editWorkspace(id, before.revision, { kind: 'assign-technician', workOrderId: 'wo-115', technicianId: 'tech-ravi' });
console.log('AFTER revision:', updated.revision);
console.log('AFTER wo-115 assigned:', updated.workOrders.find((o) => o.id === 'wo-115')?.assignedTechnicianId);
const again = await readWorkspace(id);
console.log('RE-READ wo-115 assigned:', again.workOrders.find((o) => o.id === 'wo-115')?.assignedTechnicianId);
await closeGraphConnection();
process.exit(0);
