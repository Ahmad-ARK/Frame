import React, { createContext, useContext } from "react";
import { StyleGuide } from "./types/styleGuide";
import { documentaryDark } from "./styleGuides/documentaryDark";

const StyleGuideContext = createContext<StyleGuide>(documentaryDark);

export const StyleGuideProvider: React.FC<{
  guide: StyleGuide;
  children: React.ReactNode;
}> = ({ guide, children }) => (
  <StyleGuideContext.Provider value={guide}>
    {children}
  </StyleGuideContext.Provider>
);

export const useStyleGuide = (): StyleGuide => useContext(StyleGuideContext);
