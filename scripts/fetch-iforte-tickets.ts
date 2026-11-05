import { env } from "../src/config/env";
import type { IforteTicket } from "../src/workers/iforte-reminder.worker";

async function main() {
  console.log("==========================================");
  console.log("   Menarik Tiket dari API iForte (NIS)");
  console.log("==========================================");
  console.log(`Endpoint URL : ${env.NIS_IFORTE_TICKETS_URL}`);
  console.log(`Token Prefix : ${env.NIS_TOKEN ? env.NIS_TOKEN.slice(0, 8) + "..." : "(kosong)"}`);
  console.log("------------------------------------------");

  const startTime = Date.now();
  const response = await fetch(env.NIS_IFORTE_TICKETS_URL, {
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${env.NIS_TOKEN}`,
    },
  });

  const duration = Date.now() - startTime;
  console.log(`HTTP Status  : ${response.status} ${response.statusText} (${duration} ms)`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Gagal mengambil tiket iForte: ${response.statusText}`);
    console.error(`Response body: ${errorText}`);
    process.exit(1);
  }

  const responseData = (await response.json()) as any;
  const tickets: IforteTicket[] = responseData.results || [];

  console.log(`Total Tiket Diterima: ${tickets.length}`);

  // Breakdown status
  const statusCounts: Record<string, number> = {};
  for (const t of tickets) {
    statusCounts[t.ticket_status] = (statusCounts[t.ticket_status] || 0) + 1;
  }
  console.log("Status Breakdown   :", JSON.stringify(statusCounts));

  const openTickets = tickets.filter((t) => t.ticket_status === "Open");
  console.log(`Tiket Berstatus 'Open': ${openTickets.length}`);

  if (openTickets.length === 0) {
    console.log("\nTidak ada tiket dengan status Open.");
    process.exit(0);
  }

  // Sorting sama seperti worker: AC first, then oldest first
  openTickets.sort((a, b) => {
    if (a.subscription_status === "AC" && b.subscription_status !== "AC") return -1;
    if (a.subscription_status !== "AC" && b.subscription_status === "AC") return 1;
    return new Date(a.insert_time).getTime() - new Date(b.insert_time).getTime();
  });

  console.log("\n================ DAFTAR TIKET OPEN ================");
  const now = Date.now();
  const messageLines = openTickets.map((ticket, index) => {
    const insertDate = new Date(ticket.insert_time);
    const ageHours = Math.floor((now - insertDate.getTime()) / (1000 * 3600));

    let alertIcon = "";
    if (ageHours >= 24) {
      alertIcon = "🚨";
    } else if (ageHours >= 18) {
      alertIcon = "⚠️";
    }

    const acIcon = ticket.subscription_status === "AC" ? "💎" : "";

    let durationText = `${ageHours} jam`;
    if (ageHours >= 48) {
      const days = Math.floor(ageHours / 24);
      durationText = `${days}+ hari`;
    }

    console.log(`\n[#${index + 1}] Tiket ID: ${ticket.ticket_id}`);
    console.log(`  Customer / Sub ID : ${ticket.customer_id} / ${ticket.subscriber_id}`);
    console.log(`  Subscriber Name   : ${ticket.subscriber_name}`);
    console.log(`  Subject           : ${ticket.ticket_subject}`);
    console.log(`  Insert Time       : ${ticket.insert_time}`);
    console.log(`  Durasi Pending    : ${durationText} (${ageHours} jam) ${alertIcon}`);
    console.log(`  Subscription Stat : ${ticket.subscription_status} ${acIcon}`);

    return `${index + 1}. ${alertIcon}${acIcon}${ticket.customer_id}:${ticket.subscriber_id} ${ticket.subscriber_name} ${ticket.ticket_subject} ${durationText}`;
  });

  console.log("\n================ FORMAT PESAN WHATSAPP ================");
  const fullMessage = `rekan iforte, mohon dibantu tindak lanjut tiket berikut ini:\n\n${messageLines.join("\n")}`;
  console.log(fullMessage);
  console.log("=======================================================");
}

main().catch((err) => {
  console.error("Terjadi error:", err);
  process.exit(1);
});
