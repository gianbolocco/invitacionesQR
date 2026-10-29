import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Los botones de Pazzit (PLAN §1.4). El hover cambia el color solo con puntero
 * fino (`hover-fino:`): en el celular el tap dejaba el hover pegado. La escala
 * al presionar la pone globals.css para todo botón.
 */
const secundario =
  "border-2 border-control bg-transparent text-azul-text hover-fino:bg-azul-tint"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-base font-bold whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-alto [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: "bg-azul text-white hover-fino:bg-[color-mix(in_srgb,var(--azul)_84%,var(--navy))]",
        destructive: "bg-alto text-white dark:text-navy hover-fino:bg-[color-mix(in_srgb,var(--alto)_88%,var(--navy))]",
        secondary: secundario,
        // Alias de `secondary`: así no hay que tocar cada uso viejo.
        outline: secundario,
        ghost: "text-ink hover-fino:bg-azul-tint",
        link: "text-azul-text underline decoration-2 underline-offset-[3px]",
        // Uso excepcional: el sol es una sola cosa por pantalla.
        sol: "bg-sol text-navy",
      },
      size: {
        default: "h-12 px-5 has-[>svg]:px-4",
        sm: "h-11 gap-1.5 px-4 text-[15px] has-[>svg]:px-3.5",
        lg: "h-14 px-6 text-base has-[>svg]:px-5",
        icon: "size-11",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
