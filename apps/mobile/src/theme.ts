export interface OrganaTheme {
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  must: string;
  mustSoft: string;
  should: string;
  shouldSoft: string;
  nice: string;
  niceSoft: string;
  accent: string;
  accentStrong: string;
  shadow: string;
}

export const lightTheme: OrganaTheme = {
  background: "#f4f0e7",
  surface: "#fffdf8",
  surfaceMuted: "#ebe6dc",
  text: "#20251f",
  textMuted: "#70766d",
  border: "#ddd8ce",
  must: "#c75d45",
  mustSoft: "#f3ded6",
  should: "#327061",
  shouldSoft: "#dcebe4",
  nice: "#9c742d",
  niceSoft: "#f2e7ca",
  accent: "#95b6a2",
  accentStrong: "#285c50",
  shadow: "#312d25",
};

export const darkTheme: OrganaTheme = {
  background: "#171a17",
  surface: "#212520",
  surfaceMuted: "#2b302a",
  text: "#f4f0e7",
  textMuted: "#aeb6aa",
  border: "#373d36",
  must: "#e18a73",
  mustSoft: "#493028",
  should: "#7db7a3",
  shouldSoft: "#273d35",
  nice: "#d5b46b",
  niceSoft: "#433a26",
  accent: "#6f9a80",
  accentStrong: "#b8d9c4",
  shadow: "#000000",
};
