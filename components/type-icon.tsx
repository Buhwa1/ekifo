import { BedDouble, Beer, Briefcase, Building2, Dumbbell, Goal, Home, Hotel, KeyRound, Music, Store, Sunset, Tent, Trees, UtensilsCrossed, Waves, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  bed: BedDouble, home: Home, key: KeyRound, hotel: Hotel, store: Store, building: Building2,
  goal: Goal, waves: Waves, sunset: Sunset, trees: Trees, utensils: UtensilsCrossed, beer: Beer,
  music: Music, dumbbell: Dumbbell, briefcase: Briefcase, tent: Tent,
};

export function TypeIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Building2;
  return <Icon className={className} aria-hidden />;
}
