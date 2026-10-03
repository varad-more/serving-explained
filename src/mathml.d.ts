// The MathML elements chapter formulas use. React renders <math> in the
// MathML namespace; @types/react does not declare the elements.
import type { HTMLAttributes } from "react";

type MathMLProps = HTMLAttributes<HTMLElement> & {
  display?: "block" | "inline";
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathMLProps;
      mrow: MathMLProps;
      mi: MathMLProps;
      mn: MathMLProps;
      mo: MathMLProps;
      msub: MathMLProps;
      mtext: MathMLProps;
    }
  }
}
