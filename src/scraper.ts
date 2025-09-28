import { chromium, Browser, Page } from "playwright"
import { isDashes } from "./dash-matcher"

export class DSBScraper {
  private browser: Browser | null = null
  private page: Page | null = null

  async init(headless: boolean = true) {
    this.browser = await chromium.launch({
      headless, // Default to headless mode
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    })
    this.page = await this.browser.newPage()
  }

  async navigate() {
    if (!this.page) throw new Error("Page not initialized")

    console.log("Navigating to DSB Mobile...")
    await this.page.goto("https://www.dsbmobile.de/")

    // Wait for page to load
    await this.page.waitForLoadState("networkidle")
    console.log("Page loaded successfully")
  }

  async login(username: string, password: string) {
    if (!this.page) throw new Error("Page not initialized")

    console.log("Attempting to login...")

    // Look for login form elements
    try {
      // Wait for login elements to be present
      await this.page.waitForSelector('input[type="text"], input[name*="user"], input[id*="user"]', { timeout: 10000 })

      // Try to find username field by various selectors
      const usernameField = await this.page
        .locator('input[type="text"], input[name*="user"], input[id*="user"]')
        .first()
      await usernameField.fill(username)
      console.log("Username entered")

      // Try to find password field
      const passwordField = await this.page.locator('input[type="password"]').first()
      await passwordField.fill(password)
      console.log("Password entered")

      // Look for login button
      const loginButton = await this.page
        .locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Anmelden")')
        .first()
      await loginButton.click()
      console.log("Login button clicked")

      // Wait for navigation or error
      await this.page.waitForLoadState("networkidle")

      // Check if login was successful by looking for default.aspx in URL
      const currentUrl = this.page.url()
      if (currentUrl.includes("default.aspx")) {
        console.log("Login successful! Redirected to:", currentUrl)
        return true
      } else {
        console.log("Login may have failed. Current URL:", currentUrl)
        return false
      }
    } catch (error) {
      console.error("Login failed:", error)
      throw error
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
    }
  }

  async clickSchuelerElement() {
    if (!this.page) throw new Error("Page not initialized")

    console.log("Looking for dsbmobile_schueler element...")

    try {
      // Wait for the element containing "dsbmobile_schueler" text
      await this.page.waitForSelector("text=dsbmobile_schueler", { timeout: 10000 })

      // Click on the element
      await this.page.click("text=dsbmobile_schueler")
      console.log("Clicked on dsbmobile_schueler element")

      // Wait for navigation/loading
      await this.page.waitForLoadState("networkidle")
    } catch (error) {
      console.error("Failed to click dsbmobile_schueler element:", error)
      throw error
    }
  }

  async extractTableFromFrame() {
    if (!this.page) throw new Error("Page not initialized")

    console.log("Looking for iframe and extracting schedule table data...")

    try {
      // Wait for iframe to be present
      await this.page.waitForSelector("iframe", { timeout: 10000 })
      console.log("Found iframe")

      // Get all frames on the page
      const frames = this.page.frames()
      console.log(`Found ${frames.length} frames`)

      // Find the iframe that contains tables
      let targetFrame = null
      for (const frame of frames) {
        try {
          await frame.waitForSelector("table", { timeout: 2000 })
          targetFrame = frame
          console.log("Found frame with tables")
          break
        } catch {
          // Frame doesn't have tables, continue
        }
      }

      if (!targetFrame) {
        throw new Error("No frame with tables found")
      }

      // Extract both date and table data from the frame
      const frameData = await targetFrame.evaluate(() => {
        // Extract date from mon_title div
        let extractedDate = null
        const monTitleElement = document.querySelector(".mon_title")
        if (monTitleElement) {
          const dateText = monTitleElement.textContent?.trim()
          if (dateText) {
            // Convert from DD.M.YYYY or DD.MM.YYYY to YYYY-MM-DD
            const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
            if (dateMatch) {
              const [, day, month, year] = dateMatch
              extractedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
            }
          }
        }

        // Extract "Stand:" date time for last_update
        let lastUpdate = null
        const standElements = document.querySelectorAll("*")
        for (const element of standElements) {
          const text = element.textContent?.trim()
          if (text && text.includes("Stand:")) {
            // Look for pattern like "Stand: 19.09.2025 09:04"
            const standMatch = text.match(/Stand:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/)
            if (standMatch) {
              const [, day, month, year, hour, minute] = standMatch

              const offsetMinutes = new Date().getTimezoneOffset()
              const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
              const offsetMins = Math.abs(offsetMinutes) % 60
              const sign = offsetMinutes <= 0 ? "+" : "-"
              const timezone = `${sign}${offsetHours.toString().padStart(2, "0")}:${offsetMins
                .toString()
                .padStart(2, "0")}`

              // Convert to ISO format with Berlin timezone
              lastUpdate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(
                2,
                "0"
              )}:${minute}:00${timezone}`
              break
            }
          }
        }
        console.log("Found Stand date:", lastUpdate)

        // Look for the table that starts with "Stunde" in the first cell
        const tables = document.querySelectorAll("table")
        console.log(`Found ${tables.length} tables`)

        for (let i = 0; i < tables.length; i++) {
          const table = tables[i]
          const firstCell = table.querySelector("tr:first-child td:first-child, tr:first-child th:first-child")

          if (firstCell && firstCell.textContent?.trim().toLowerCase().includes("stunde")) {
            console.log(`Found schedule table (table ${i + 1})`)

            const rows = table.querySelectorAll("tr")
            const data: string[][] = []

            rows.forEach((row) => {
              const cells = row.querySelectorAll("td, th")
              const rowData: string[] = []

              cells.forEach((cell) => {
                // Get text content and clean it up
                const text = cell.textContent?.trim() || ""
                rowData.push(text)
              })

              if (rowData.length > 0) {
                data.push(rowData)
              }
            })

            return { date: extractedDate, tableData: data, lastUpdate: lastUpdate }
          }
        }

        // If no table with "Stunde" found, return info about all tables
        console.log('No table with "Stunde" found. Available tables:')
        const allTablesInfo: string[] = []
        tables.forEach((table, i) => {
          const firstCell = table.querySelector("tr:first-child td:first-child, tr:first-child th:first-child")
          const firstCellText = firstCell?.textContent?.trim() || "empty"
          allTablesInfo.push(`Table ${i + 1}: "${firstCellText}"`)
          console.log(`Table ${i + 1}: "${firstCellText}"`)
        })

        throw new Error(`No table with "Stunde" found. Available: ${allTablesInfo.join(", ")}`)
      })

      console.log("Extracted date:", frameData.date)
      console.log("Extracted schedule table data:")
      console.log(JSON.stringify(frameData.tableData, null, 2))

      // Process the data to format it properly
      const formattedMessages = this.formatScheduleData(frameData.tableData)
      console.log("Formatted schedule data:")
      console.log(JSON.stringify(formattedMessages, null, 2))

      // Return the new format with date and messages
      return {
        date: frameData.date,
        messages: formattedMessages,
      }
    } catch (error) {
      console.error("Failed to extract schedule table from iframe:", error)
      throw error
    }
  }

  private formatScheduleData(rawData: string[][]): Record<string, any[]> {
    // Skip the header row (first row)
    const dataRows = rawData.slice(1)
    const formattedData: Record<string, any[]> = {}

    let currentKey = ""

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]

      // If row has only one entry, it's a key (class name)
      if (row.length === 1 && row[0].trim() !== "") {
        currentKey = isDashes(row[0]) ? "allgemein" : row[0].trim()
        formattedData[currentKey] = []
      }
      // If row has multiple entries and we have a current key, it's data for that key
      else if (row.length > 1 && currentKey) {
        // Create an object from the row data using the original header structure
        // Convert '---' strings to null for cleaner data
        const scheduleEntry = {
          stunde: isDashes(row[0]) ? null : row[0] || "",
          vertreter: isDashes(row[1]) ? null : row[1] || "",
          fach_vorher: isDashes(row[2]) ? null : row[2] || "",
          fach_neu: isDashes(row[3]) ? null : row[3] || "",
          raum_vorher: isDashes(row[4]) ? null : row[4] || "",
          raum_neu: isDashes(row[5]) ? null : row[5] || "",
          text: isDashes(row[6]) ? null : row[6] || "",
        }
        formattedData[currentKey].push(scheduleEntry)
      }
    }

    return formattedData
  }

  async clickMainPageNext(): Promise<boolean> {
    if (!this.page) throw new Error("Page not initialized")

    console.log("Looking for main page next button...")

    try {
      // Look for control-next button on the main page (not in iframe)
      const nextButton = await this.page.locator("img.control-next").first()

      // Check if button exists and is not disabled
      const isDisabled = await nextButton
        .evaluate((el) => {
          return el.classList.contains("disabled")
        })
        .catch(() => true) // If element doesn't exist, consider it disabled

      if (isDisabled) {
        console.log("Main page next button is disabled")
        return false
      }

      // Click the next button
      await nextButton.click()
      console.log("Clicked main page next button")

      // Wait for page to load
      await this.page.waitForLoadState("networkidle")

      // Small delay to ensure content is updated
      await new Promise((resolve) => setTimeout(resolve, 2000))

      return true
    } catch (error) {
      console.error("Failed to click main page next button:", error)
      return false
    }
  }

  async extractCurrentPageData(): Promise<
    Array<{ date: string | null; messages: Record<string, any[]>; lastUpdate: string | null }>
  > {
    if (!this.page) throw new Error("Page not initialized")

    console.log("Looking for all iframes and extracting schedule data from each...")

    try {
      // Wait for iframes to be present
      await this.page.waitForSelector("iframe", { timeout: 10000 })
      console.log("Found iframes")

      // Get all frames on the page
      const frames = this.page.frames()
      console.log(`Found ${frames.length} total frames`)

      const allDaysData: Array<{ date: string | null; messages: Record<string, any[]>; lastUpdate: string | null }> = []

      // Process each frame to find ones with schedule data
      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i]

        try {
          // Check if this frame has tables
          await frame.waitForSelector("table", { timeout: 2000 })
          console.log(`\n--- Processing frame ${i + 1} ---`)

          // Extract data from this frame
          const frameData = await frame.evaluate(() => {
            // Extract date from mon_title div
            let extractedDate = null
            const monTitleElement = document.querySelector(".mon_title")
            if (monTitleElement) {
              const dateText = monTitleElement.textContent?.trim()
              if (dateText) {
                // Convert from DD.M.YYYY or DD.MM.YYYY to YYYY-MM-DD
                const dateMatch = dateText.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/)
                if (dateMatch) {
                  const [, day, month, year] = dateMatch
                  extractedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
                }
              }
            }

            // Extract "Stand:" date time for last_update
            let lastUpdate = null
            const standElements = document.querySelectorAll("*")
            for (const element of standElements) {
              const text = element.textContent?.trim()
              if (text && text.includes("Stand:")) {
                // Look for pattern like "Stand: 19.09.2025 09:04"
                const standMatch = text.match(/Stand:\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/)
                if (standMatch) {
                  const [, day, month, year, hour, minute] = standMatch
                  // Create date to check if it's DST in Berlin
                  const offsetMinutes = new Date().getTimezoneOffset()
                  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
                  const offsetMins = Math.abs(offsetMinutes) % 60
                  const sign = offsetMinutes <= 0 ? "+" : "-"
                  const timezone = `${sign}${offsetHours.toString().padStart(2, "0")}:${offsetMins
                    .toString()
                    .padStart(2, "0")}`
                  // Convert to ISO format with Berlin timezone
                  lastUpdate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(
                    2,
                    "0"
                  )}:${minute}:00${timezone}`
                  break
                }
              }
            }

            // Look for the table that starts with "Stunde" in the first cell
            const tables = document.querySelectorAll("table")
            console.log(`Found ${tables.length} tables in this frame`)

            for (let i = 0; i < tables.length; i++) {
              const table = tables[i]
              const firstCell = table.querySelector("tr:first-child td:first-child, tr:first-child th:first-child")

              if (firstCell && firstCell.textContent?.trim().toLowerCase().includes("stunde")) {
                console.log(`Found schedule table (table ${i + 1})`)

                const rows = table.querySelectorAll("tr")
                const data: string[][] = []

                rows.forEach((row) => {
                  const cells = row.querySelectorAll("td, th")
                  const rowData: string[] = []

                  cells.forEach((cell) => {
                    // Get text content and clean it up
                    const text = cell.textContent?.trim() || ""
                    rowData.push(text)
                  })

                  if (rowData.length > 0) {
                    data.push(rowData)
                  }
                })

                return { date: extractedDate, tableData: data, lastUpdate: lastUpdate }
              }
            }

            // Return null if no schedule table found
            return null
          })

          // If we found valid data in this frame, process it
          if (frameData && frameData.tableData) {
            console.log(`Extracted date: ${frameData.date}`)

            // Process the data to format it properly
            const formattedMessages = this.formatScheduleData(frameData.tableData)

            // Add to collection
            allDaysData.push({
              date: frameData.date,
              messages: formattedMessages,
              lastUpdate: frameData.lastUpdate,
            })

            console.log(`Successfully extracted data for ${frameData.date || "unknown date"}`)
          } else {
            console.log(`No schedule data found in frame ${i + 1}`)
          }
        } catch (error) {
          // Frame doesn't have tables or other error, skip it
          console.log(`Frame ${i + 1}: No tables or error occurred, skipping`)
        }
      }

      console.log(`\nCompleted extraction for ${allDaysData.length} days from ${frames.length} frames on current page`)
      return allDaysData
    } catch (error) {
      console.error("Failed to extract data from frames:", error)
      throw error
    }
  }

  async extractAllDaysData(): Promise<{
    last_update: string | null
    last_scrape: string
    days: Array<{ date: string | null; messages: Record<string, any[]> }>
  }> {
    // Use Map to deduplicate by date, keeping newest data (later pages override earlier ones)
    const dateMap = new Map<string, { date: string | null; messages: Record<string, any[]> }>()
    let lastUpdate: string | null = null
    let pageCount = 1
    const maxPages = 20 // Safety limit to prevent infinite loops

    console.log("Starting multi-page data extraction...")

    while (pageCount <= maxPages) {
      try {
        console.log(`\n=== Processing page ${pageCount} ===`)

        // Extract data from all iframes on current page
        const currentPageData = await this.extractCurrentPageData()
        console.log(`Found ${currentPageData.length} days on page ${pageCount}`)

        // Add current page data to collection, merging messages for same date
        for (const dayData of currentPageData) {
          // Capture the last_update from the first frame that has it
          if (dayData.lastUpdate && !lastUpdate) {
            lastUpdate = dayData.lastUpdate
            console.log(`Captured last_update: ${lastUpdate}`)
          }

          if (dayData.date) {
            const existingData = dateMap.get(dayData.date)
            if (existingData) {
              console.log(`Merging data for ${dayData.date} from page ${pageCount} with existing data`)
              // Merge messages using spread operator - newer data (current page) overwrites existing
              const mergedMessages = { ...existingData.messages, ...dayData.messages }
              dateMap.set(dayData.date, { date: dayData.date, messages: mergedMessages })
            } else {
              console.log(`Adding new data for ${dayData.date} from page ${pageCount}`)
              // Only store date and messages, not lastUpdate since it goes at the top level
              dateMap.set(dayData.date, { date: dayData.date, messages: dayData.messages })
            }
          } else {
            console.log(`Skipping entry with null date from page ${pageCount}`)
          }
        }

        // Try to navigate to next page
        const hasNextPage = await this.clickMainPageNext()
        if (!hasNextPage) {
          console.log("No more pages available (button disabled or not found)")
          break
        }

        pageCount++
      } catch (error) {
        console.error(`Error processing page ${pageCount}:`, error)
        break
      }
    }

    if (pageCount > maxPages) {
      console.log("Reached maximum pages limit")
    }

    // Convert Map to array and sort by date
    const allData = Array.from(dateMap.values()).sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return a.date.localeCompare(b.date)
    })

    // Generate last_scrape timestamp in Berlin timezone
    const now = new Date()
    const berlinTime = new Intl.DateTimeFormat("sv-SE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .format(now)
      .replace(" ", "T")

    // Calculate timezone offset in minutes and convert to hours:minutes format
    const offsetMinutes = new Date().getTimezoneOffset()
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
    const offsetMins = Math.abs(offsetMinutes) % 60
    const sign = offsetMinutes <= 0 ? "+" : "-"
    const timezone = `${sign}${offsetHours.toString().padStart(2, "0")}:${offsetMins.toString().padStart(2, "0")}`
    const lastScrape = `${berlinTime}${timezone}`

    console.log(`\n=== Completed extraction ===`)
    console.log(`Total pages processed: ${pageCount}`)
    console.log(`Unique days extracted: ${allData.length}`)
    console.log(`Date range: ${allData[0]?.date || "unknown"} to ${allData[allData.length - 1]?.date || "unknown"}`)
    console.log(`Last update: ${lastUpdate || "not found"}`)
    console.log(`Last scrape: ${lastScrape}`)

    return {
      last_update: lastUpdate,
      last_scrape: lastScrape,
      days: allData,
    }
  }

  async screenshot(filename: string = "screenshot.png") {
    if (!this.page) throw new Error("Page not initialized")

    const screenshotPath = `screenshots/${filename}`
    await this.page.screenshot({ path: screenshotPath, fullPage: true })
    console.log(`Screenshot saved as ${screenshotPath}`)
  }
}
