import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary [&_svg]:size-4 [&_svg]:shrink-0", {
  variants: { variant: { default: "bg-primary text-primary-foreground hover:brightness-110", outline: "border border-border bg-white text-foreground hover:bg-secondary", ghost: "text-foreground hover:bg-secondary" } },
  defaultVariants: { variant: "default" },
});
function Button({ className, variant, asChild = false, type = "button", ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" type={type} className={cn(buttonVariants({ variant, className }))} {...props} />;
}
export { Button, buttonVariants };
