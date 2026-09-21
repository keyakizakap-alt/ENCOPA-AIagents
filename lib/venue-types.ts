export type VenueSearchResult = {
  id: string;
  name: string;
  genre: string;
  catchCopy: string;
  address: string;
  access: string;
  latitude: number;
  longitude: number;
  budgetLabel: string;
  estimatedPrice: number | null;
  capacity: number | null;
  partyCapacity: number | null;
  privateRoom: boolean;
  freeDrink: boolean;
  course: boolean;
  nonSmoking: string;
  openingHours: string;
  closed: string;
  url: string;
  photoUrl: string;
  score: number;
  reason: string;
  breakdown: {
    fit: number;
    budget: number;
    convenience: number;
  };
};

export type VenueSearchResponse = {
  venues: VenueSearchResult[];
  total: number;
  provider: "ホットペッパー グルメ";
  fetchedAt: number;
};
