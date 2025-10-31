import * as React from "react";
const SvgComponent = (props: React.SVGProps<SVGSVGElement>) => {
  const { color, ...restProps } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={1200}
      height={1024}
      {...restProps}
    >
      <defs>
        <mask
          id="a"
          width={1200}
          height={1024}
          x={0}
          y={0}
          maskUnits="userSpaceOnUse"
        >
          <path d="M0 0h1200v1024H0z" />
          <g fill="#fff">
            <path d="M0 120h1200v18H0zM0 148h1200v18H0zM0 176h1200v18H0zM0 204h1200v18H0zM0 232h1200v18H0zM0 260h1200v18H0zM0 288h1200v18H0zM0 316h1200v18H0zM0 344h1200v18H0zM0 372h1200v18H0zM0 400h1200v18H0zM0 428h1200v18H0zM0 456h1200v18H0zM0 484h1200v18H0zM0 512h1200v18H0zM0 540h1200v18H0zM0 568h1200v18H0zM0 596h1200v18H0zM0 624h1200v18H0zM0 652h1200v18H0zM0 680h1200v18H0zM0 708h1200v18H0zM0 736h1200v18H0zM0 764h1200v18H0zM0 792h1200v18H0zM0 820h1200v18H0zM0 848h1200v18H0z" />
          </g>
        </mask>
      </defs>
      <g mask="url(#a)">
        <text
          x="50%"
          y="58%"
          fill={color || "#E8D6BA"}
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize={360}
          fontWeight={900}
          letterSpacing={0}
          textAnchor="middle"
        >
          {"\n      NRIC-1\n    "}
        </text>
      </g>
    </svg>
  );
};
export default SvgComponent;
