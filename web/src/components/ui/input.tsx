import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 rounded-sm border-2 border-control bg-card px-3.5 text-base text-ink transition-[border-color] duration-(--t-hover) outline-none placeholder:text-ink-soft disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:border-azul-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-invalid:border-alto",
        "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
