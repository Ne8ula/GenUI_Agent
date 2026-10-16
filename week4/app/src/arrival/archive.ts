export interface ArchivePhoto {
  readonly id: string
  readonly src: string
  readonly title: string
  readonly creator: string
  readonly creditHref: string
}

const credit = (id: string) => `/sources/paris-r17/credits.html#${id}`
// Reviewed, local catalogue only. Credits retain date uncertainty and original licences.
export const ARCHIVE_PHOTOS: readonly ArchivePhoto[] = [
  { id: 'montparnasse', src: '/sources/paris-r15/montparnasse-1980.jpg', title: 'Montparnasse · 1980', creator: 'Pascal Dolémieux', creditHref: credit('montparnasse') },
  { id: 'montmartre', src: '/sources/paris-r15/montmartre-1980.jpg', title: 'Montmartre · 1980', creator: 'bigup21', creditHref: credit('montmartre') },
  { id: 'conciergerie', src: '/sources/paris-r15/conciergerie-1980.jpg', title: 'Conciergerie · 1980', creator: 'Johnckarnes', creditHref: credit('conciergerie') },
  { id: 'tgv53', src: '/sources/paris-r10/tgv53-1985.jpg', title: 'Gare de Lyon · 1985', creator: 'Phil Richards', creditHref: credit('tgv53') },
  { id: 'rue-christine', src: '/sources/paris-r10/rue-christine-1988.jpg', title: 'Rue Christine · 1988', creator: 'Esther Westerveld', creditHref: credit('rue-christine') },
  { id: 'beaubourg', src: '/sources/paris-r17/beaubourg-1980s.jpg', title: 'Beaubourg · 1980s', creator: 'OliBac / Olivier Bacquet', creditHref: credit('beaubourg') },
  { id: 'clichy', src: '/sources/paris-r17/clichy-1982.jpg', title: 'Place de Clichy · 1982', creator: 'Willy Pragher', creditHref: credit('clichy') },
]
