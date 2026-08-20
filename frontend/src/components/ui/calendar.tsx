import { DayPicker, type DayPickerProps } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

import 'react-day-picker/style.css';

export type CalendarProps = DayPickerProps & {
  onMonthCaptionClick?: (month: Date) => void;
};

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  navLayout = 'around',
  onMonthCaptionClick,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      locale={ru}
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn('rdp-custom p-2', className)}
      classNames={{
        root: 'rdp-root',
        months: 'relative flex flex-col',
        month:
          'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-y-2',
        month_caption:
          'col-start-2 row-start-1 flex items-center justify-center px-1',
        caption_label: cn(
          onMonthCaptionClick
            ? 'cursor-pointer rounded-md px-2 py-0.5 text-center text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground'
            : 'pointer-events-none text-center text-sm font-medium',
          classNames?.caption_label,
        ),
        button_previous: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'col-start-1 row-start-1 h-8 w-8 shrink-0 rounded-lg opacity-70 hover:opacity-100',
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'col-start-3 row-start-1 h-8 w-8 shrink-0 rounded-lg opacity-70 hover:opacity-100',
        ),
        month_grid: 'col-span-3 row-start-2 w-full border-collapse',
        weekdays: 'flex',
        weekday:
          'w-9 text-center text-[0.75rem] font-normal text-muted-foreground',
        week: 'mt-1 flex w-full',
        day: 'relative p-0 text-center text-sm',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 rounded-lg p-0 font-normal',
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
        range_start:
          '[&>button]:bg-primary [&>button]:text-primary-foreground',
        range_end:
          '[&>button]:bg-primary [&>button]:text-primary-foreground',
        range_middle:
          '[&>button]:rounded-none [&>button]:bg-primary/25 [&>button]:text-foreground [&>button]:hover:bg-primary/35',
        today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
        outside: 'text-muted-foreground opacity-45',
        disabled: 'text-muted-foreground opacity-35 [&>button]:opacity-35',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
        ...(onMonthCaptionClick
          ? {
              MonthCaption: ({
                calendarMonth,
                className: captionClassName,
                ...captionProps
              }) => (
                <div className={captionClassName} {...captionProps}>
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({ variant: 'ghost' }),
                      'h-auto px-2 py-0.5 text-sm font-medium',
                    )}
                    title="Выбрать весь месяц"
                    onClick={() =>
                      onMonthCaptionClick(startOfMonth(calendarMonth.date))
                    }
                  >
                    {format(calendarMonth.date, 'LLLL yyyy', { locale: ru })}
                  </button>
                </div>
              ),
            }
          : {}),
        ...components,
      }}
      {...props}
    />
  );
}
