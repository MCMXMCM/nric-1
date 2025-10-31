import React from "react";
import { render, screen } from "@testing-library/react";
import LoadingTextMultiLine from "../LoadingTextMultiLine";

describe("LoadingTextMultiLine", () => {
  it("should render with single line", () => {
    render(<LoadingTextMultiLine lineCount={1} lineLength={10} />);
    const container = screen.getByTestId("loading-text-multiline");
    expect(container).toBeInTheDocument();
  });

  it("should render with multiple lines", () => {
    render(<LoadingTextMultiLine lineCount={3} lineLength={15} />);
    const container = screen.getByTestId("loading-text-multiline");
    expect(container).toBeInTheDocument();
  });

  it("should apply custom styles", () => {
    const customStyle = { color: "red" };
    render(
      <LoadingTextMultiLine lineCount={2} lineLength={8} style={customStyle} />
    );
    const container = screen.getByTestId("loading-text-multiline");
    expect(container).toHaveStyle("color: rgb(255, 0, 0)");
  });

  it("should apply custom className", () => {
    render(
      <LoadingTextMultiLine
        lineCount={1}
        lineLength={5}
        className="custom-class"
      />
    );
    const container = screen.getByTestId("loading-text-multiline");
    expect(container).toHaveClass("custom-class");
  });
});
