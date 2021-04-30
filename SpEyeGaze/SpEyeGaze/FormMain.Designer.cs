
namespace SpEyeGaze
{
    partial class FormMain
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            this.components = new System.ComponentModel.Container();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(FormMain));
            this.btnAddStartupIcon = new System.Windows.Forms.Button();
            this.flowLayoutPanel = new System.Windows.Forms.FlowLayoutPanel();
            this.toggleButtonOnOff = new System.Windows.Forms.CheckBox();
            this.btnMinimize = new System.Windows.Forms.Button();
            this.btnExit = new System.Windows.Forms.Button();
            this.mainSplitContainer = new System.Windows.Forms.SplitContainer();
            this.labelTobiiComputerControl = new System.Windows.Forms.Label();
            this.labelBalabolkaRunning = new System.Windows.Forms.Label();
            this.notifyIcon = new System.Windows.Forms.NotifyIcon(this.components);
            this.screenshotTimer = new System.Windows.Forms.Timer(this.components);
            this.processCheckerTimer = new System.Windows.Forms.Timer(this.components);
            this.labelBalabolkaFocused = new System.Windows.Forms.Label();
            this.flowLayoutPanel.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)(this.mainSplitContainer)).BeginInit();
            this.mainSplitContainer.Panel1.SuspendLayout();
            this.mainSplitContainer.Panel2.SuspendLayout();
            this.mainSplitContainer.SuspendLayout();
            this.SuspendLayout();
            // 
            // btnAddStartupIcon
            // 
            this.btnAddStartupIcon.Enabled = false;
            this.btnAddStartupIcon.Font = new System.Drawing.Font("Segoe UI", 16.125F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
            this.btnAddStartupIcon.Location = new System.Drawing.Point(20, 260);
            this.btnAddStartupIcon.Margin = new System.Windows.Forms.Padding(20);
            this.btnAddStartupIcon.Name = "btnAddStartupIcon";
            this.btnAddStartupIcon.Size = new System.Drawing.Size(300, 200);
            this.btnAddStartupIcon.TabIndex = 0;
            this.btnAddStartupIcon.Text = "Add Startup Icon";
            this.btnAddStartupIcon.UseVisualStyleBackColor = true;
            this.btnAddStartupIcon.Click += new System.EventHandler(this.btnAddStartupIcon_Click);
            // 
            // flowLayoutPanel
            // 
            this.flowLayoutPanel.Controls.Add(this.toggleButtonOnOff);
            this.flowLayoutPanel.Controls.Add(this.btnAddStartupIcon);
            this.flowLayoutPanel.Controls.Add(this.btnMinimize);
            this.flowLayoutPanel.Controls.Add(this.btnExit);
            this.flowLayoutPanel.Dock = System.Windows.Forms.DockStyle.Fill;
            this.flowLayoutPanel.FlowDirection = System.Windows.Forms.FlowDirection.TopDown;
            this.flowLayoutPanel.Location = new System.Drawing.Point(0, 0);
            this.flowLayoutPanel.Name = "flowLayoutPanel";
            this.flowLayoutPanel.Size = new System.Drawing.Size(339, 978);
            this.flowLayoutPanel.TabIndex = 2;
            // 
            // toggleButtonOnOff
            // 
            this.toggleButtonOnOff.Appearance = System.Windows.Forms.Appearance.Button;
            this.toggleButtonOnOff.Font = new System.Drawing.Font("Segoe UI", 16.125F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
            this.toggleButtonOnOff.Location = new System.Drawing.Point(20, 20);
            this.toggleButtonOnOff.Margin = new System.Windows.Forms.Padding(20);
            this.toggleButtonOnOff.Name = "toggleButtonOnOff";
            this.toggleButtonOnOff.Size = new System.Drawing.Size(300, 200);
            this.toggleButtonOnOff.TabIndex = 4;
            this.toggleButtonOnOff.Text = "Turn Recording On";
            this.toggleButtonOnOff.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
            this.toggleButtonOnOff.UseVisualStyleBackColor = true;
            this.toggleButtonOnOff.Click += new System.EventHandler(this.toggleButtonOnOff_Click);
            // 
            // btnMinimize
            // 
            this.btnMinimize.Font = new System.Drawing.Font("Segoe UI", 16.125F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
            this.btnMinimize.Location = new System.Drawing.Point(20, 500);
            this.btnMinimize.Margin = new System.Windows.Forms.Padding(20);
            this.btnMinimize.Name = "btnMinimize";
            this.btnMinimize.Size = new System.Drawing.Size(300, 200);
            this.btnMinimize.TabIndex = 2;
            this.btnMinimize.Text = "Minimize";
            this.btnMinimize.UseVisualStyleBackColor = true;
            this.btnMinimize.Click += new System.EventHandler(this.btnMinimize_Click);
            // 
            // btnExit
            // 
            this.btnExit.Font = new System.Drawing.Font("Segoe UI", 16.125F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
            this.btnExit.Location = new System.Drawing.Point(20, 740);
            this.btnExit.Margin = new System.Windows.Forms.Padding(20);
            this.btnExit.Name = "btnExit";
            this.btnExit.Size = new System.Drawing.Size(300, 200);
            this.btnExit.TabIndex = 3;
            this.btnExit.Text = "Exit";
            this.btnExit.UseVisualStyleBackColor = true;
            this.btnExit.Click += new System.EventHandler(this.btnExit_Click);
            // 
            // mainSplitContainer
            // 
            this.mainSplitContainer.Dock = System.Windows.Forms.DockStyle.Fill;
            this.mainSplitContainer.Location = new System.Drawing.Point(0, 0);
            this.mainSplitContainer.Name = "mainSplitContainer";
            // 
            // mainSplitContainer.Panel1
            // 
            this.mainSplitContainer.Panel1.Controls.Add(this.flowLayoutPanel);
            // 
            // mainSplitContainer.Panel2
            // 
            this.mainSplitContainer.Panel2.Controls.Add(this.labelBalabolkaFocused);
            this.mainSplitContainer.Panel2.Controls.Add(this.labelTobiiComputerControl);
            this.mainSplitContainer.Panel2.Controls.Add(this.labelBalabolkaRunning);
            this.mainSplitContainer.Size = new System.Drawing.Size(819, 978);
            this.mainSplitContainer.SplitterDistance = 339;
            this.mainSplitContainer.TabIndex = 3;
            // 
            // labelTobiiComputerControl
            // 
            this.labelTobiiComputerControl.AutoSize = true;
            this.labelTobiiComputerControl.Location = new System.Drawing.Point(25, 52);
            this.labelTobiiComputerControl.Name = "labelTobiiComputerControl";
            this.labelTobiiComputerControl.Size = new System.Drawing.Size(422, 32);
            this.labelTobiiComputerControl.TabIndex = 1;
            this.labelTobiiComputerControl.Text = "Tobii Computer Control is not running";
            // 
            // labelBalabolkaRunning
            // 
            this.labelBalabolkaRunning.AutoSize = true;
            this.labelBalabolkaRunning.Location = new System.Drawing.Point(25, 20);
            this.labelBalabolkaRunning.Name = "labelBalabolkaRunning";
            this.labelBalabolkaRunning.Size = new System.Drawing.Size(273, 32);
            this.labelBalabolkaRunning.TabIndex = 0;
            this.labelBalabolkaRunning.Text = "Balabolka is not running";
            // 
            // notifyIcon
            // 
            this.notifyIcon.Icon = ((System.Drawing.Icon)(resources.GetObject("notifyIcon.Icon")));
            this.notifyIcon.Text = "SpEyeGaze";
            this.notifyIcon.Visible = true;
            this.notifyIcon.Click += new System.EventHandler(this.notifyIcon_Click);
            this.notifyIcon.DoubleClick += new System.EventHandler(this.notifyIcon_DoubleClick);
            // 
            // screenshotTimer
            // 
            this.screenshotTimer.Interval = 200;
            this.screenshotTimer.Tick += new System.EventHandler(this.screenshotTimer_Tick);
            // 
            // processCheckerTimer
            // 
            this.processCheckerTimer.Enabled = true;
            this.processCheckerTimer.Interval = 2000;
            this.processCheckerTimer.Tick += new System.EventHandler(this.balabolkaTimer_Tick);
            // 
            // labelBalabolkaFocused
            // 
            this.labelBalabolkaFocused.AutoSize = true;
            this.labelBalabolkaFocused.Location = new System.Drawing.Point(25, 84);
            this.labelBalabolkaFocused.Name = "labelBalabolkaFocused";
            this.labelBalabolkaFocused.Size = new System.Drawing.Size(278, 32);
            this.labelBalabolkaFocused.TabIndex = 2;
            this.labelBalabolkaFocused.Text = "Balabolka is not focused.";
            // 
            // FormMain
            // 
            this.AutoScaleDimensions = new System.Drawing.SizeF(13F, 32F);
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
            this.ClientSize = new System.Drawing.Size(819, 978);
            this.ControlBox = false;
            this.Controls.Add(this.mainSplitContainer);
            this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
            this.MinimizeBox = false;
            this.Name = "FormMain";
            this.ShowIcon = false;
            this.Text = "SpEyeGaze";
            this.WindowState = System.Windows.Forms.FormWindowState.Minimized;
            this.Load += new System.EventHandler(this.FormMain_Load);
            this.flowLayoutPanel.ResumeLayout(false);
            this.mainSplitContainer.Panel1.ResumeLayout(false);
            this.mainSplitContainer.Panel2.ResumeLayout(false);
            this.mainSplitContainer.Panel2.PerformLayout();
            ((System.ComponentModel.ISupportInitialize)(this.mainSplitContainer)).EndInit();
            this.mainSplitContainer.ResumeLayout(false);
            this.ResumeLayout(false);

        }

        #endregion

        private System.Windows.Forms.Button btnAddStartupIcon;
        private System.Windows.Forms.FlowLayoutPanel flowLayoutPanel;
        private System.Windows.Forms.SplitContainer mainSplitContainer;
        private System.Windows.Forms.NotifyIcon notifyIcon;
        private System.Windows.Forms.Button btnMinimize;
        private System.Windows.Forms.Button btnExit;
        private System.Windows.Forms.Timer screenshotTimer;
        private System.Windows.Forms.Label labelBalabolkaRunning;
        private System.Windows.Forms.Timer processCheckerTimer;
        private System.Windows.Forms.Label labelTobiiComputerControl;
        private System.Windows.Forms.CheckBox toggleButtonOnOff;
        private System.Windows.Forms.Label labelBalabolkaFocused;
    }
}

