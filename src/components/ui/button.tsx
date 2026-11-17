import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm whitespace-nowrap transition-[background-color,border-color,color] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-text font-semibold text-ground hover:bg-text/85",
        outline: "border-line bg-raised text-text hover:bg-line aria-expanded:bg-line",
        secondary: "bg-raised text-text hover:bg-line aria-expanded:bg-line",
        ghost: "text-muted hover:bg-raised hover:text-text aria-expanded:bg-raised aria-expanded:text-text",
        // The one selected treatment, shared by nav, scope rows and filter strips.
        tab: "border-line text-muted hover:text-text aria-pressed:border-focus aria-pressed:bg-[var(--focus-wash)] aria-pressed:font-semibold aria-pressed:text-text aria-[current=page]:border-focus aria-[current=page]:bg-[var(--focus-wash)] aria-[current=page]:font-semibold aria-[current=page]:text-text",
        link: "text-text underline underline-offset-2",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        // The shared height for every control that sits in a filter or scope
        // bar, so tabs, selects and inputs line up on one baseline.
        tab: "h-[var(--control-h)] gap-1.5 px-3 text-sm",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
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
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
