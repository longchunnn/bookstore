import { useRef } from "react";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { SectionHeader } from "../../pages/HomePage";
import BookCard, { type BookCardData } from "./BookCard";
type Props = {
  title: string;
  books: BookCardData[];
  viewAllTo?: string;
};

export default function BookSlider({ title, books, viewAllTo }: Props) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const slide = (direction: "left" | "right") => {
    if (sliderRef.current) {
      const scrollAmount = sliderRef.current.clientWidth / 4;
      sliderRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <section className="relative p-4 md:p-5 group">
      <SectionHeader title={title} to={viewAllTo} />
      <button
        onClick={() => slide("left")}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 hidden group-hover:flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-full shadow-md text-gray-600 hover:text-teal-700 hover:border-teal-700 transition-all"
      >
        <LeftOutlined />
      </button>
      <div
        ref={sliderRef}
        className="mt-4 flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        {books.map((b) => (
          <div
            key={b.id}
            className="flex-none w-[80vw] sm:w-[45vw] lg:w-[calc(25%-12px)] snap-start"
          >
            <BookCard data={b} imageHeightClassName="h-[18.2rem]" />
          </div>
        ))}
      </div>
      <button
        onClick={() => slide("right")}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 hidden group-hover:flex items-center justify-center w-10 h-10 bg-white border border-gray-200 rounded-full shadow-md text-gray-600 hover:text-teal-700 hover:border-teal-700 transition-all"
      >
        <RightOutlined />
      </button>
    </section>
  );
}
