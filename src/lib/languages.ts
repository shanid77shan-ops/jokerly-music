export interface Language {
  id: string;
  label: string;
  emoji: string;
  query: string;
  artistQuery: string;
}

export const LANGUAGES: Language[] = [
  { id: "english",    label: "English",    emoji: "🇬🇧", query: "top english pop hits 2024",       artistQuery: "english pop artist" },
  { id: "hindi",      label: "Hindi",      emoji: "🇮🇳", query: "bollywood hits 2024",              artistQuery: "bollywood singer" },
  { id: "korean",     label: "Korean",     emoji: "🇰🇷", query: "kpop hits 2024",                   artistQuery: "kpop artist" },
  { id: "spanish",    label: "Spanish",    emoji: "🇪🇸", query: "latin pop reggaeton 2024",         artistQuery: "latin pop artist" },
  { id: "japanese",   label: "Japanese",   emoji: "🇯🇵", query: "jpop hits 2024",                   artistQuery: "jpop artist" },
  { id: "french",     label: "French",     emoji: "🇫🇷", query: "french pop musique 2024",          artistQuery: "french pop artiste" },
  { id: "portuguese", label: "Portuguese", emoji: "🇧🇷", query: "musica brasileira pagode 2024",    artistQuery: "sertanejo cantor" },
  { id: "arabic",     label: "Arabic",     emoji: "🇸🇦", query: "arabic pop music 2024",            artistQuery: "arabic pop singer" },
  { id: "tamil",      label: "Tamil",      emoji: "🎵",  query: "tamil hits kollywood 2024",        artistQuery: "tamil singer" },
  { id: "telugu",     label: "Telugu",     emoji: "🎵",  query: "telugu hits tollywood 2024",       artistQuery: "telugu singer" },
  { id: "punjabi",    label: "Punjabi",    emoji: "🎵",  query: "punjabi pop hits 2024",            artistQuery: "punjabi singer" },
  { id: "bengali",    label: "Bengali",    emoji: "🎵",  query: "bengali songs 2024",               artistQuery: "bengali singer" },
  { id: "german",     label: "German",     emoji: "🇩🇪", query: "deutsche pop musik 2024",          artistQuery: "deutscher popstar" },
  { id: "italian",    label: "Italian",    emoji: "🇮🇹", query: "musica italiana pop 2024",         artistQuery: "cantante italiano" },
  { id: "turkish",    label: "Turkish",    emoji: "🇹🇷", query: "türkçe pop müzik 2024",            artistQuery: "türk pop sanatçı" },
  { id: "russian",    label: "Russian",    emoji: "🇷🇺", query: "russian pop music 2024",           artistQuery: "russian pop singer" },
];

export function getLanguage(id: string): Language | undefined {
  return LANGUAGES.find((l) => l.id === id);
}
