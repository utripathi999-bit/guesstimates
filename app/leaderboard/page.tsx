import { Flame, Medal, Trophy } from 'lucide-react';
import { getTopLeaderboard } from '@/lib/leaderboard';

export const dynamic = 'force-dynamic';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFC800] text-white shadow-[0_3px_0_#E5A500]">
        <Trophy className="h-5 w-5" strokeWidth={2.5} />
      </div>
    );
  }
  if (rank === 2 || rank === 3) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1CB0F6] text-white shadow-[0_3px_0_#1899D6]">
        <Medal className="h-5 w-5" strokeWidth={2.5} />
      </div>
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F7F7F7] text-[#4B4B4B] font-extrabold border-2 border-[#E5E5E5]">
      {rank}
    </div>
  );
}

export default async function LeaderboardPage() {
  const entries = await getTopLeaderboard();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-extrabold text-[#4B4B4B]">Streak Leaderboard</h1>
        <p className="mt-1 text-[#777]">Top 10 GuesstimateDaily streaks, right now.</p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border-2 border-[#E5E5E5] bg-white p-8 text-center text-[#777]">
          No streaks recorded yet. Be the first to show up on the board.
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry, index) => (
            <li
              key={entry.userId}
              className="flex items-center gap-4 rounded-2xl border-2 border-[#E5E5E5] bg-white px-4 py-3"
            >
              <RankBadge rank={index + 1} />
              <span className="flex-1 truncate font-bold text-[#4B4B4B]">{entry.userId}</span>
              <span className="flex items-center gap-1 rounded-full bg-[#FFF4E5] px-3 py-1 font-extrabold text-[#FF9600]">
                <Flame className="h-4 w-4" strokeWidth={2.5} fill="#FF9600" />
                {entry.streak}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
