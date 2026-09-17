/** Decorative anatomy: no sensor data, health values, or operational status. */
export function SomaticFrame() {
  return <svg className="somatic-frame" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true">
    <g className="tendon-contour" fill="none">
      <path d="M2 126C22 110 6 77 24 45C37 20 86 20 126 4M998 574C974 593 991 625 975 656C959 681 913 682 871 696" />
      <path d="M7 154C31 120 12 89 34 60C54 34 94 37 139 11M993 546C968 580 988 611 965 641C945 666 905 664 861 689" />
      <path d="M1 656C16 630 6 616 17 590M999 44C981 71 995 85 981 111" />
    </g>
    <g className="vertebrae">{Array.from({length:8},(_,i)=><g key={i}>
      <path d={`M0 ${176+i*53}Q18 ${184+i*53} 10 ${204+i*53}L0 ${212+i*53}Z`} />
      <path d={`M1000 ${151+i*53}Q982 ${160+i*53} 990 ${180+i*53}L1000 ${187+i*53}Z`} />
    </g>)}</g>
    <g className="capillary" fill="none"><path d="M20 44C53 57 63 18 101 18S160 6 211 6M24 49C58 68 66 48 79 34M974 651C945 638 934 680 897 682S838 694 787 694M970 646C941 626 930 650 914 666" /></g>
  </svg>;
}
