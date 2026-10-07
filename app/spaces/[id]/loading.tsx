export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="skeleton -mx-4 -mt-6 aspect-[4/3] rounded-none sm:mx-0 sm:mt-0 sm:aspect-auto sm:h-[420px] sm:rounded-[var(--radius-card)]" />
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="skeleton h-4 w-32" />
          <div className="skeleton mt-3 h-9 w-3/4" />
          <div className="skeleton mt-3 h-4 w-1/2" />
          <div className="skeleton mt-6 h-32 w-full rounded-[var(--radius-card)]" />
          <div className="skeleton mt-10 h-56 w-full rounded-[var(--radius-card)]" />
        </div>
        <div className="skeleton hidden h-72 rounded-[var(--radius-card)] lg:block" />
      </div>
    </div>
  );
}
