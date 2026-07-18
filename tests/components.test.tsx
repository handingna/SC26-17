import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BirthChartCard } from "@/components/birth-chart-card";
import { ProfileView } from "@/components/profile-view";
import { SAMPLE_WARDROBE, WardrobeView } from "@/components/wardrobe-view";
import { TodayView } from "@/components/today-view";
import type { ModelStatus } from "@/lib/types";
import { makeReading, validBirthChart, validProfile, validWardrobe } from "./fixtures/factories";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("BirthChartCard", () => {
  it("shows all four pillars, five counts, and the transparent method boundary", () => {
    render(<BirthChartCard chart={validBirthChart} />);
    expect(screen.getByText("辛未")).toBeInTheDocument();
    expect(screen.getByText("辛丑")).toBeInTheDocument();
    expect(screen.getByText("戊申")).toBeInTheDocument();
    expect(screen.getByText("戊午")).toBeInTheDocument();
    expect(screen.getByLabelText("五行表层计数").children).toHaveLength(5);
    expect(screen.getByText(/23:00 起按次日干支/)).toBeInTheDocument();
    expect(screen.getByText(/不含藏干、旺衰、喜用神或真太阳时/)).toBeInTheDocument();
  });
});

describe("ProfileView", () => {
  it("requires date and time before calling the chart API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ProfileView profile={null} chart={null} onNavigate={vi.fn()} onSkipWardrobe={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "保存并计算四柱" }));
    expect(await screen.findByText(/请填写出生日期和时间/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts only birth date/time to the deterministic chart endpoint and displays the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(validBirthChart), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn(() => true);
    render(<ProfileView profile={null} chart={null} onNavigate={vi.fn()} onSkipWardrobe={vi.fn()} onSaved={onSaved} />);

    fireEvent.change(screen.getByLabelText(/公历出生日期/), { target: { value: "1992-02-02" } });
    fireEvent.change(screen.getByLabelText(/出生时间/), { target: { value: "12:00" } });
    await userEvent.click(screen.getByRole("button", { name: "保存并计算四柱" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/birth-chart", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ birthDate: "1992-02-02", birthTime: "12:00" }),
    }));
    expect(screen.getByText(/档案已保存/)).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({
      birthDate: "1992-02-02",
      birthTime: "12:00",
    }), validBirthChart);
  });

  it("marks a migrated profile with missing time as needing completion", () => {
    render(<ProfileView profile={{ ...validProfile, birthTime: "" }} chart={null} onNavigate={vi.fn()} onSkipWardrobe={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText(/旧版档案缺少出生时间/)).toBeInTheDocument();
  });
});

describe("WardrobeView", () => {
  it("keeps an uninitialized wardrobe empty until the user explicitly chooses samples", async () => {
    const onChange = vi.fn(() => true);
    render(<WardrobeView items={null} onChange={onChange} />);
    expect(screen.getByText("从示例或自己的单品开始")).toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_WARDROBE[0].name)).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "使用 3 件示例单品" }));
    expect(onChange).toHaveBeenCalledWith(SAMPLE_WARDROBE);
  });

  it("renders an explicit empty wardrobe without reviving samples", () => {
    const onChange = vi.fn(() => true);
    render(<WardrobeView items={[]} onChange={onChange} />);
    expect(screen.getByText("衣橱目前是空的")).toBeInTheDocument();
    expect(screen.queryByText("从示例或自己的单品开始")).not.toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_WARDROBE[0].name)).not.toBeInTheDocument();
  });

  it("passes enabled-state changes and removals back through persistence", async () => {
    const onChange = vi.fn(() => true);
    render(<WardrobeView items={[validWardrobe[0]]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "启用 玉白衬衫" }));
    expect(onChange).toHaveBeenLastCalledWith([{ ...validWardrobe[0], enabled: false }]);
    await userEvent.click(screen.getByRole("button", { name: "移除 玉白衬衫" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("edits an existing item without changing its stable ID", async () => {
    const onChange = vi.fn(() => true);
    render(<WardrobeView items={[validWardrobe[0]]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "编辑 玉白衬衫" }));
    await userEvent.clear(screen.getByLabelText(/衣物名称/));
    await userEvent.type(screen.getByLabelText(/衣物名称/), "雾蓝通勤外套");
    await userEvent.selectOptions(screen.getByLabelText(/类别/), "外套");
    await userEvent.clear(screen.getByLabelText(/主色名称/));
    await userEvent.type(screen.getByLabelText(/主色名称/), "雾蓝");
    await userEvent.click(screen.getByRole("button", { name: "保存修改" }));

    expect(onChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        id: "white-shirt",
        name: "雾蓝通勤外套",
        category: "外套",
        primaryColor: expect.objectContaining({ name: "雾蓝" }),
      }),
    ]);
  });

  it("cancels an edit without persisting draft changes", async () => {
    const onChange = vi.fn(() => true);
    render(<WardrobeView items={[validWardrobe[0]]} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: "编辑 玉白衬衫" }));
    await userEvent.clear(screen.getByLabelText(/衣物名称/));
    await userEvent.type(screen.getByLabelText(/衣物名称/), "不应保存");
    const cancelButtons = screen.getAllByRole("button", { name: "取消编辑" });
    await userEvent.click(cancelButtons[cancelButtons.length - 1]);

    expect(screen.getByText("玉白衬衫", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("不应保存", { exact: true })).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("TodayView", () => {
  const status: ModelStatus = {
    state: "ready",
    configured: true,
    provider: "ECNU",
    model: "ecnu-max",
    promptVersion: "style-v3-grounded-bazi-v4",
    schemaVersion: "daily-reading-v4",
  };

  it("does not block initial profile guidance while model status is loading", () => {
    render(<TodayView
      hydrated
      profile={null}
      birthChart={null}
      wardrobe={null}
      reading={null}
      modelStatus={null}
      generation={{ status: "idle" }}
      cacheHit={false}
      onGenerate={vi.fn()}
      onUseDemo={vi.fn()}
      onNavigate={vi.fn()}
    />);
    expect(screen.getByRole("button", { name: "建立自己的档案" })).toBeEnabled();
    expect(screen.getByText("完成档案", { exact: true })).toBeInTheDocument();
  });

  it("offers explicit demo fallback after a model error while retaining the chart", async () => {
    const onUseDemo = vi.fn();
    render(<TodayView
      hydrated
      profile={validProfile}
      birthChart={validBirthChart}
      wardrobe={validWardrobe}
      reading={null}
      modelStatus={status}
      generation={{ status: "error", code: "MODEL_TIMEOUT", message: "模型响应超时", retryable: true }}
      cacheHit={false}
      onGenerate={vi.fn()}
      onUseDemo={onUseDemo}
      onNavigate={vi.fn()}
    />);
    expect(screen.getByRole("alert")).toHaveTextContent("模型响应超时");
    expect(screen.getByText("辛未")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "使用演示内容" }));
    expect(onUseDemo).toHaveBeenCalledOnce();
  });

  it("renders real wardrobe matches by validated ID", () => {
    render(<TodayView
      hydrated
      profile={validProfile}
      birthChart={validBirthChart}
      wardrobe={validWardrobe}
      reading={makeReading()}
      modelStatus={status}
      generation={{ status: "idle" }}
      cacheHit={false}
      onGenerate={vi.fn()}
      onUseDemo={vi.fn()}
      onNavigate={vi.fn()}
    />);
    expect(screen.getAllByText("玉白衬衫", { exact: true }).length).toBeGreaterThan(0);
    expect(screen.getByText("模型生成")).toBeInTheDocument();
    expect(screen.getByText(/不推算流日吉凶/)).toBeInTheDocument();
  });
});
