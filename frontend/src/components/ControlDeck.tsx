'use client';

import { LayoutDashboard, Users, Bot, Trophy, User } from 'lucide-react';

export interface DeckItem {
  icon: typeof LayoutDashboard;
  label: string;
  id: string;
}

export const DECK_ITEMS: DeckItem[] = [
  { icon: LayoutDashboard, label: 'Arcade', id: 'play' },
  { icon: Users, label: 'DAO', id: 'dao' },
  { icon: Bot, label: 'Agent', id: 'agent' },
  { icon: Trophy, label: 'Leaderboard', id: 'leaderboard' },
  { icon: User, label: 'Profile', id: 'profile' },
];

export function ControlDeck({ activeTab, onSelect }: { activeTab: string; onSelect: (id: string) => void }) {
  return (
    <nav className="sticky bottom-0 z-30 border-t border-border bg-background/90 backdrop-blur-md">
      <div className="max-w-md mx-auto px-2 py-2 flex items-center justify-around">
        {DECK_ITEMS.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`flex flex-1 min-w-0 flex-col items-center gap-1 px-1 sm:px-3 py-2 rounded-xl transition-all ${
                active ? 'text-primary' : 'text-text-muted hover:text-text-secondary'
              }`}
              aria-label={item.label}
            >
              <item.icon className={`w-5 h-5 ${active ? 'text-primary' : ''}`} />
              <span className={`text-[10px] font-medium truncate max-w-full ${active ? 'font-bold' : ''}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
