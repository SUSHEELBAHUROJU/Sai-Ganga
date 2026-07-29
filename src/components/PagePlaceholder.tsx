type PagePlaceholderProps = {
  title: string
}

export function PagePlaceholder({ title }: PagePlaceholderProps) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <h2 className="text-xl font-semibold text-slate-400 dark:text-slate-600">{title}</h2>
    </div>
  )
}
