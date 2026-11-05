import { nusacontactContactSyncProcessor } from "../src/workers/nusacontact-contact-sync.worker";

async function main() {
  const phone = process.argv[2] || "628196066607";
  console.log(`Testing Nusacontact Contact Sync for phone: ${phone}...`);

  const mockJob = {
    id: "test-direct-run",
    name: "sync-nusacontact-contact",
    data: { phone },
    updateProgress: async (p: number) => console.log(`[Progress] ${p}%`),
    log: async (msg: string) => console.log(`[Log] ${msg}`),
  };

  const result = await nusacontactContactSyncProcessor(mockJob as any);
  console.log("\n================ RESULT ================");
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("Error executing processor:", err);
  process.exit(1);
});
