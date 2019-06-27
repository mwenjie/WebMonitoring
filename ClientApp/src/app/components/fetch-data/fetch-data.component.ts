import { Component, Inject, OnInit, OnDestroy } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { NotificationService } from "../../services/notification.service";
import { AlertService } from "../../services/alert.service";
import { AuthService } from "../../services/auth.service";
import { MatDialog } from "@angular/material/dialog";
import { interval, Observable, Subscription } from "rxjs";
import { ConfigureAlertDialogComponent } from "./config-alert.component";
import {
  switchMap,
  concatMap,
  map,
  flatMap,
  tap,
  mergeMap
} from "rxjs/operators";
import { BehaviorSubject } from "rxjs/BehaviorSubject";

@Component({
  selector: "app-fetch-data",
  templateUrl: "./fetch-data.component.html",
  styleUrls: ["./fetch-data.component.css"]
})
export class FetchDataComponent implements OnInit, OnDestroy {
  private name: string;
  notifications: Notification[] = [];
  load$ = new BehaviorSubject("");
  alertSub = new Subscription();

  constructor(
    http: HttpClient,
    @Inject("BASE_URL") baseUrl: string,
    private notificationService: NotificationService,
    private alertService: AlertService,
    private dialog: MatDialog,
    private authService: AuthService
  ) {}

  ngOnInit() {
    if (!this.authService.IsLoggedIn) {
      this.authService
        .user_login()
        .then()
        .catch(error =>
          this.alertService.error1(
            "Error connecting to the server. Please try again later"
          )
        );
    }
  }

  startNotificationProcessing() {
    const notification$ = this.load$.pipe(
      switchMap(_ =>
        this.notificationService.countNotification().pipe(
          tap(result => (this.notifications = result)),
          flatMap(notifications => notifications), //flatten every observable to array
          flatMap(
            //flatten items in the array
            notification =>
              interval(
                this.notificationService.calculateInterval(
                  notification.frequency
                )
              ).pipe(
                switchMap(o =>
                  this.notificationService.queryAdvertisement(notification)
                )
              )
          )
        )
      )
    );

    const saveNotification$ = notification$.pipe(
      mergeMap(updatedNotification =>
        this.notificationService.saveNotification(updatedNotification)
      )
    );
    const alert$ = saveNotification$.pipe(
      switchMap(message => this.notificationService.sendNotification(message))
    );

    this.alertSub = alert$.subscribe(r => console.log(r));
    //saveNotification$.subscribe();
  }

  ngOnDestroy() {
    this.alertSub.unsubscribe();
  }

  openDialog(): void {
    const dialogRef = this.dialog.open(ConfigureAlertDialogComponent, {
      width: "450px",
      data: { name: this.name }
    });

    dialogRef
      .afterClosed()
      .pipe(
        concatMap(result => {
          return this.notificationService.countNotification();
        })
      )
      .subscribe(data => (this.notifications = data));
  }

  editNotification(notification: Notification) {
    const dialogRef = this.dialog.open(ConfigureAlertDialogComponent, {
      width: "450px",
      data: {
        id: notification.id,
        subject: notification.subject,
        url: notification.url,
        email: notification.email,
        frequency: notification.frequency,
        min: notification.min,
        max: notification.max,
        advertisement: notification.advertisement
      }
    });

    dialogRef.afterClosed().subscribe(() => {
      this.load$.next("");
    });
  }

  deleteNotification(notification: Notification) {
    this.alertService.confirm(
      "Are you sure you want to set the current configuration as your new defaults?",
      () => this.goToDeleteNotification(notification),
      () => null
    );
  }

  goToDeleteNotification(notification: Notification) {
    this.notificationService
      .deleteNotification(notification.id)
      .pipe(
        concatMap(result => {
          return this.notificationService.countNotification();
        })
      )
      .subscribe(data => {
        this.notifications = data;
        this.load$.next("");
      });
  }
}
