'use client';

import React from 'react';
import {
  DEFAULT_SCHEDULE,
  SCHEDULE_UPDATED_EVENT,
  loadSchedule,
  saveSchedule,
  type MeetingTime,
  type ScheduleSnapshot,
} from '@/lib/scheduleStorage';

const START_HOUR = 8;
const END_HOUR = 22;
const SLOT_MINUTES = 30;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;

const DAY_ORDER = ['M', 'T', 'W', 'H', 'F', 'S'] as const;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type GridBlock = {
  key: string;
  column: number;
  rowStart: number;
  rowEnd: number;
  overflowTop: boolean;
  overflowBottom: boolean;
  label: string;
  subtitle: string;
  meta: string;
  color: string;
  tooltip: string;
  isClosed: boolean;
};

type SidebarItem = {
  key: string;
  label: string;
  subtitle: string;
  detail: string;
  muted?: boolean;
  isClosed?: boolean;
};

const campusColors: Record<string, string> = {
  busch: '#3B82F6',
  livingston: '#F97316',
  'college avenue': '#EAB308',
  'cook/douglass': '#22C55E',
  'downtown nb': '#A855F7',
  online: '#6B7280',
  newark: '#14B8A6',
  camden: '#EC4899',
};

const parseMilitaryTime = (time?: string | null): number | null => {
  if (!time) return null;
  const raw = time.trim();
  if (!raw) return null;
  const padded = raw.padStart(4, '0');
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const formatMilitaryTime = (time?: string | null): string => {
  const minutes = parseMilitaryTime(time);
  if (minutes === null) return 'TBA';
  const hour24 = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${mins.toString().padStart(2, '0')} ${period}`;
};

const formatHourLabel = (hour24: number): string => {
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${period}`;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const resolveCampusColor = (campus?: string | null, isOnline?: boolean | null) => {
  if (isOnline) return campusColors.online;
  if (!campus) return campusColors.busch;
  const key = campus.toLowerCase();
  if (campusColors[key]) return campusColors[key];
  if (key.includes('busch')) return campusColors.busch;
  if (key.includes('livingston')) return campusColors.livingston;
  if (key.includes('college avenue')) return campusColors['college avenue'];
  if (key.includes('cook') || key.includes('douglass')) return campusColors['cook/douglass'];
  if (key.includes('downtown')) return campusColors['downtown nb'];
  if (key.includes('newark') || key.includes('nk')) return campusColors.newark;
  if (key.includes('camden') || key.includes('cm')) return campusColors.camden;
  if (key.includes('online')) return campusColors.online;
  return campusColors.busch;
};

const buildMeetingLabel = (meeting: MeetingTime) => {
  const start = meeting.startTime || formatMilitaryTime(meeting.startTimeMilitary);
  const end = meeting.endTime || formatMilitaryTime(meeting.endTimeMilitary);
  if (start === 'TBA' || end === 'TBA') return 'TBA';
  return `${start} - ${end}`;
};

export const ScheduleGrid: React.FC = () => {
  const [schedule, setSchedule] = React.useState<ScheduleSnapshot>({ ...DEFAULT_SCHEDULE });
  const [isLoaded, setIsLoaded] = React.useState(false);

  React.useEffect(() => {
    setSchedule(loadSchedule());
    setIsLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!isLoaded) return;
    saveSchedule(schedule);
  }, [schedule, isLoaded]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleUpdate = () => setSchedule(loadSchedule());
    window.addEventListener(SCHEDULE_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SCHEDULE_UPDATED_EVENT, handleUpdate);
  }, []);

  const { blocks, sidebarItems } = React.useMemo(() => {
    const nextBlocks: GridBlock[] = [];
    const nextSidebar: SidebarItem[] = [];

    schedule.sections.forEach((section) => {
      const meetings = section.meetingTimes || [];
      const courseLabel = section.courseString || 'Course';
      const title = section.courseTitle || '';
      const sectionLabel = section.sectionNumber ? `Sec ${section.sectionNumber}` : '';
      const instructor = section.instructors && section.instructors.length > 0 ? section.instructors[0] : '';
      const sectionOnline = Boolean(section.isOnline);
      const isClosed = section.isOpen === false;

      if (meetings.length === 0) {
        if (sectionOnline) {
          nextSidebar.push({
            key: `online-${section.indexNumber}`,
            label: courseLabel,
            subtitle: title,
            detail: 'Online or async',
            isClosed,
          });
        }
        return;
      }

      meetings.forEach((meeting, index) => {
        const day = meeting.day ? meeting.day.toUpperCase() : '';
        const meetingOnline = Boolean(meeting.isOnline || sectionOnline);
        const dayIndex = DAY_ORDER.indexOf(day as (typeof DAY_ORDER)[number]);
        const hasValidDay = dayIndex !== -1;
        const startMinutes = parseMilitaryTime(meeting.startTimeMilitary);
        const endMinutes = parseMilitaryTime(meeting.endTimeMilitary);
        const hasValidTimes = startMinutes !== null && endMinutes !== null;
        const isSunday = day === 'U';

        if (meetingOnline || isSunday || !hasValidDay || !hasValidTimes) {
          const detailParts = [
            meetingOnline ? 'Online' : null,
            isSunday ? 'Sunday meeting' : null,
            hasValidTimes ? buildMeetingLabel(meeting) : 'TBA',
          ].filter(Boolean);
          const locationParts = [meeting.building, meeting.room].filter(Boolean);
          const detail = locationParts.length > 0 ? `${detailParts.join(' - ')} - ${locationParts.join(' ')}` : detailParts.join(' - ');

          nextSidebar.push({
            key: `side-${section.indexNumber}-${day || 'tba'}-${index}`,
            label: courseLabel,
            subtitle: title,
            detail,
            muted: meetingOnline,
            isClosed,
          });
          return;
        }

        const startOffset = startMinutes - START_HOUR * 60;
        const endOffset = endMinutes - START_HOUR * 60;
        const startSlotRaw = startOffset / SLOT_MINUTES;
        const endSlotRaw = endOffset / SLOT_MINUTES;
        const overflowTop = startOffset < 0;
        const overflowBottom = endOffset > (END_HOUR - START_HOUR) * 60;

        const startSlot = clamp(Math.floor(startSlotRaw), 0, TOTAL_SLOTS);
        const endSlot = clamp(Math.ceil(endSlotRaw), 0, TOTAL_SLOTS);

        if (endSlot <= startSlot) return;

        const rowStart = 2 + startSlot;
        const rowEnd = 2 + endSlot;
        const column = 2 + dayIndex;
        const location = [meeting.building, meeting.room].filter(Boolean).join(' ');
        const timeLabel = buildMeetingLabel(meeting);
        const tooltip = `${courseLabel}${sectionLabel ? ` (${sectionLabel})` : ''} - ${timeLabel}`;

        nextBlocks.push({
          key: `${section.indexNumber}-${day}-${meeting.startTimeMilitary || index}`,
          column,
          rowStart,
          rowEnd,
          overflowTop,
          overflowBottom,
          label: `${courseLabel}${section.sectionNumber ? `-${section.sectionNumber}` : ''}`,
          subtitle: location || meeting.campus || 'TBA location',
          meta: instructor || title,
          color: resolveCampusColor(meeting.campus, meetingOnline),
          tooltip,
          isClosed,
        });
      });
    });

    return { blocks: nextBlocks, sidebarItems: nextSidebar };
  }, [schedule]);

  const timeSlots = React.useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, index) => {
      const minutesFromStart = index * SLOT_MINUTES;
      const totalMinutes = START_HOUR * 60 + minutesFromStart;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return {
        key: `slot-${index}`,
        label: minute === 0 ? formatHourLabel(hour) : '',
      };
    });
  }, []);

  return (
    <section className="w-full">
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-1 border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">Schedule Builder</h2>
          <p className="text-sm text-muted-foreground">
            Spring {schedule.termYear} - {schedule.campus}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row">
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-[860px] p-4">
              <div
                className="relative grid rounded-xl border border-border bg-background"
                style={{
                  gridTemplateColumns: '72px repeat(6, minmax(0, 1fr))',
                  gridTemplateRows: `40px repeat(${TOTAL_SLOTS}, 28px)`,
                }}
              >
                <div className="col-start-1 row-start-1 flex items-center justify-center border-b border-r border-border text-xs font-medium text-muted-foreground">
                  Time
                </div>

                {DAY_LABELS.map((label, index) => (
                  <div
                    key={label}
                    className="row-start-1 flex items-center justify-center border-b border-r border-border text-xs font-semibold text-foreground"
                    style={{ gridColumnStart: index + 2 }}
                  >
                    {label}
                  </div>
                ))}

                {timeSlots.map((slot, rowIndex) => (
                  <div
                    key={slot.key}
                    className="col-start-1 flex items-start justify-center border-b border-r border-border text-[11px] text-muted-foreground"
                    style={{ gridRowStart: rowIndex + 2 }}
                  >
                    {slot.label}
                  </div>
                ))}

                {DAY_LABELS.map((_, dayIndex) =>
                  timeSlots.map((slot, rowIndex) => (
                    <div
                      key={`${dayIndex}-${slot.key}`}
                      className="border-b border-r border-border bg-background"
                      style={{ gridColumnStart: dayIndex + 2, gridRowStart: rowIndex + 2 }}
                    />
                  )),
                )}

                {blocks.map((block) => (
                  <div
                    key={block.key}
                    title={block.tooltip}
                    className="relative z-10 mx-1 my-[2px] flex flex-col gap-0.5 overflow-hidden rounded-lg px-2 py-1 text-[11px] text-white shadow-sm"
                    style={{
                      gridColumnStart: block.column,
                      gridRowStart: block.rowStart,
                      gridRowEnd: block.rowEnd,
                      backgroundColor: block.color,
                    }}
                  >
                    {block.isClosed && (
                      <span className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-600">
                        FULL
                      </span>
                    )}
                    {block.overflowTop && (
                      <span className="absolute left-0 right-0 top-0 h-2 bg-white/30" />
                    )}
                    {block.overflowBottom && (
                      <span className="absolute bottom-0 left-0 right-0 h-2 bg-white/30" />
                    )}
                    <span className="font-semibold leading-tight">{block.label}</span>
                    <span className="leading-tight text-white/90">{block.subtitle}</span>
                    {block.meta && (
                      <span className="truncate leading-tight text-white/80">{block.meta}</span>
                    )}
                  </div>
                ))}

                {blocks.length === 0 && (
                  <div className="col-start-2 col-end-[-1] row-start-2 row-end-[-1] flex items-center justify-center text-sm text-muted-foreground">
                    Your schedule is empty. Add a section to see it here.
                  </div>
                )}
              </div>
            </div>
          </div>

          <aside className="w-full border-t border-border bg-muted/30 lg:w-80 lg:border-l lg:border-t-0">
            <div className="p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-sm font-semibold text-foreground">Online + Sunday</h3>
                <span className="text-xs text-muted-foreground">Async and non-grid</span>
              </div>

              <div className="mt-3 space-y-3">
                {sidebarItems.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs text-muted-foreground">
                    No online or Sunday meetings yet.
                  </div>
                ) : (
                  sidebarItems.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-lg border border-border bg-background px-3 py-2"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <span>{item.label}</span>
                        {item.isClosed && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-600">
                            FULL
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <div className="text-[11px] text-muted-foreground">{item.subtitle}</div>
                      )}
                      <div
                        className={
                          item.muted
                            ? 'text-[11px] text-muted-foreground'
                            : 'text-[11px] text-foreground'
                        }
                      >
                        {item.detail}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
};
