import type { Locale } from "@/i18n/config";
import { es } from "@/i18n/dictionaries/es";
import { ptPT } from "@/i18n/dictionaries/pt-PT";

export interface Dictionary {
  meta: {
    description: string;
  };
  common: {
    close: string;
    closeEsc: string;
    save: string;
    saving: string;
    saved: string;
    saveError: string;
    search: string;
    searching: string;
    choose: string;
    tba: string;
    unexpectedError: string;
    invalidData: string;
  };
  nav: {
    logoAria: string;
    mainAria: string;
    selectFestivalAria: string;
    lineup: string;
    festivalMode: string;
    import: string;
    settings: string;
    syncStatus: (done: number, total: number) => string;
    retrySyncTitle: string;
    retryingSync: string;
    retrySync: (count: number) => string;
    themeLight: string;
    themeDark: string;
  };
  home: {
    emptyTitle: string;
    emptyDescription: string;
    emptyAction: string;
  };
  workspace: {
    emptyLineupTitle: string;
    emptyLineupDescription: string;
    emptyLineupAction: string;
    noMatchesTitle: string;
    noMatchesDescription: string;
    gridAria: string;
    indexAria: string;
    artistsBadge: (count: number) => string;
    artistsBadgeShort: (count: number) => string;
  };
  filters: {
    sectionAria: string;
    searchPlaceholder: string;
    searchAria: string;
    statusAria: string;
    statusAll: string;
    statusPending: string;
    statusListening: string;
    statusRated: string;
    statusDiscarded: string;
    ratingAria: string;
    ratingAll: string;
    ratingMust: string;
    ratingLow: string;
    ratingUnrated: string;
    viewGrid: string;
    viewIndex: string;
  };
  ratingControl: {
    rateAria: (step: number) => string;
    discardAria: string;
  };
  drawer: {
    defaultHeader: string;
    defaultAria: string;
    artistAria: (name: string) => string;
    collabTablistAria: string;
    artistCardFallback: string;
    notThisArtist: string;
    syncErrorPrefix: string;
    statusPending: string;
    statusListening: string;
    statusRated: string;
    statusDiscarded: string;
    personalNotes: string;
    notesPlaceholder: string;
    biography: string;
    loadingInfo: string;
    noBioYet: string;
    discographyTitle: string;
    pinActive: string;
    pinAction: string;
    loadingDiscography: string;
    noAlbumsYet: string;
    currentSetTitle: string;
    dayPlaceholder: string;
    dayAria: string;
    stagePlaceholder: string;
    stageAria: string;
    timePlaceholder: string;
    timeAria: string;
    liveRatingLabel: string;
    liveNotesPlaceholder: string;
    liveNotesAria: string;
    setSaved: string;
    saveSet: string;
    festivalHistoryTitle: string;
    liveBadge: (rating: number) => string;
  };
  disambiguate: {
    title: string;
    description: string;
    searchPlaceholder: string;
    searchAria: string;
    fetchError: string;
    connectionError: string;
    noCandidates: string;
    noAdditionalDescription: string;
  };
  importer: {
    title: string;
    subtitle: string;
    targetFestivalAria: string;
    newFestivalButton: string;
    createFestivalAria: string;
    nameLabel: string;
    namePlaceholder: string;
    yearLabel: string;
    locationLabel: string;
    startDateLabel: string;
    endDateLabel: string;
    creating: string;
    create: string;
    rawLineupLabel: string;
    analyzeButton: string;
    rowsReady: (included: number, total: number) => string;
    locationInvalidError: string;
    dateOrderError: string;
    selectFestivalError: string;
    noValidRowsError: string;
    importedSummary: (entries: number, newArtists: number) => string;
    viewLineup: string;
    scheduleToggle: string;
    colInclude: string;
    colBillingName: string;
    colArtists: string;
    colSubtitle: string;
    colDay: string;
    colStage: string;
    colTime: string;
    includeAria: (name: string) => string;
    billingNameRowAria: (row: number) => string;
    artistsRowAria: (row: number) => string;
    subtitleRowAria: (row: number) => string;
    dayRowAria: (row: number) => string;
    stageRowAria: (row: number) => string;
    timeRowAria: (row: number) => string;
    importing: string;
    importEntries: (count: number) => string;
  };
  places: {
    placeholder: string;
    clearAria: string;
    suggestionsAria: string;
    searching: string;
    noResults: (query: string) => string;
    fetchError: string;
    connectionError: string;
  };
  festivalMode: {
    noFestivalTitle: string;
    noFestivalDescription: string;
    noFestivalAction: string;
    mustSeeLabel: string;
    allSetsLabel: string;
    filterByDayAria: string;
    allDays: string;
    emptyTitle: string;
    emptyMustSeeDescription: string;
    emptyDayDescription: string;
    showAllSets: string;
    backToLineup: string;
    listAria: string;
  };
  settings: {
    title: string;
    subtitle: string;
    languageSectionTitle: string;
    languageDescription: string;
    languagePtLabel: string;
    languagePtMeta: string;
    languageEsLabel: string;
    languageEsMeta: string;
    activeBadge: string;
    themeSectionTitle: string;
    themeDescription: string;
    themeDarkLabel: string;
    themeDarkMeta: string;
    themeLightLabel: string;
    themeLightMeta: string;
    savedNotice: string;
  };
  errors: {
    saveRating: string;
    changeStatus: string;
    saveNotes: string;
    togglePin: string;
    saveAlbumUrl: string;
    disambiguateArtist: string;
    createFestival: string;
    saveSchedule: string;
    importLineup: string;
    queryTooLong: string;
    placesServiceError: string;
    missingQueryParam: string;
    musicBrainzServiceError: string;
  };
}

const DICTIONARIES: Record<Locale, Dictionary> = {
  "pt-PT": ptPT,
  es,
};

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

